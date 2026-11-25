import { recordUsage } from "@/server/usage";
import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { WhatsappAccount, WhatsappConversation } from "@/db/schema";
import { runAgent, type HistoryMsg } from "./agent";
import { markRead, sendInteractiveButtons, sendText, withinServiceWindow } from "./graph";
import { CONFIRM_BUTTONS } from "./cart-math";
import { dbCartStore } from "./cart";
import { handleButton } from "./buttons";
import type { WaEvent } from "./parse";

const HISTORY = 12;
const AI_PER_10_MIN = 20;

async function accountFor(phoneNumberId: string) {
  const a = await db.query.whatsappAccounts.findFirst({ where: eq(schema.whatsappAccounts.phoneNumberId, phoneNumberId) });
  return a && a.status === "connected" ? a : null;
}

async function upsertConversation(account: WhatsappAccount, waId: string, name: string | undefined, patch: Partial<typeof schema.whatsappConversations.$inferInsert>) {
  const [row] = await db.insert(schema.whatsappConversations)
    .values({ tenantId: account.tenantId, accountId: account.id, customerWaId: waId, customerName: name ?? null, ...patch })
    .onConflictDoUpdate({ target: [schema.whatsappConversations.accountId, schema.whatsappConversations.customerWaId], set: { ...(name ? { customerName: name } : {}), ...patch } })
    .returning();
  return row;
}

export const pauseUntil = (account: Pick<WhatsappAccount, "handoffMinutes">, now = Date.now()) => new Date(now + account.handoffMinutes * 60_000);
export const aiActive = (account: Pick<WhatsappAccount, "aiEnabled">, conv: Pick<WhatsappConversation, "aiPausedUntil">, now = Date.now()) =>
  account.aiEnabled && (!conv.aiPausedUntil || conv.aiPausedUntil.getTime() <= now);

async function history(convId: string): Promise<HistoryMsg[]> {
  const rows = await db.select().from(schema.whatsappMessages).where(eq(schema.whatsappMessages.conversationId, convId)).orderBy(desc(schema.whatsappMessages.createdAt)).limit(HISTORY);
  const msgs: HistoryMsg[] = [];
  for (const r of rows.reverse()) {
    if (!r.body || r.status === "skipped" || r.status === "failed") continue;
    const role = r.direction === "in" ? "user" : "assistant";
    const last = msgs[msgs.length - 1];
    if (last && last.role === role) last.content += `\n${r.body}`; else msgs.push({ role, content: r.body });
  }
  while (msgs.length && msgs[0].role !== "user") msgs.shift();
  return msgs;
}

/** Flag the chat for the owner ("Needs you" in the admin) and leave an audit trail. No request context here, so insert directly. */
async function flagNeedsHuman(tenantId: string, convId: string, reason: string) {
  await db.update(schema.whatsappConversations).set({ needsHuman: true, needsHumanReason: reason }).where(eq(schema.whatsappConversations.id, convId));
  await db.insert(schema.auditLogs).values({ tenantId, action: "whatsapp.needs_human", meta: { conversationId: convId, reason } });
}

async function handleInbound(e: Extract<WaEvent, { kind: "inbound" }>) {
  const account = await accountFor(e.phoneNumberId);
  if (!account) return;
  const ts = new Date(e.timestamp * 1000);
  const existed = await db.query.whatsappConversations.findFirst({ where: and(eq(schema.whatsappConversations.accountId, account.id), eq(schema.whatsappConversations.customerWaId, e.from)) });
  const conv = await upsertConversation(account, e.from, e.name, { lastMessageAt: ts, lastCustomerMessageAt: ts });
  // dedupe: Meta retries webhooks; wamid is unique
  const ins = await db.insert(schema.whatsappMessages).values({ conversationId: conv.id, waMessageId: e.wamid, direction: "in", source: "customer", type: e.type, body: e.text, raw: e.raw as object }).onConflictDoNothing().returning({ id: schema.whatsappMessages.id });
  if (!ins.length) return;
  await markRead(account, e.wamid);
  if (!aiActive(account, conv)) return;
  if (!withinServiceWindow(conv)) return;

  // per-conversation rate limit on AI replies: ONE atomic UPDATE reserves a slot, so concurrent messages can never overshoot the cap
  const slot = await db.execute(sql`
    update whatsapp_conversations set
      ai_window_count = case when ai_window_start is null or ai_window_start < now() - interval '10 minutes' then 1 else ai_window_count + 1 end,
      ai_window_start = case when ai_window_start is null or ai_window_start < now() - interval '10 minutes' then now() else ai_window_start end
    where id = ${conv.id} and (ai_window_start is null or ai_window_start < now() - interval '10 minutes' or ai_window_count < ${AI_PER_10_MIN})
    returning id`);
  if (!(slot as unknown as unknown[]).length) return;

  const tenant = await db.query.tenants.findFirst({ where: eq(schema.tenants.id, account.tenantId) });
  if (!tenant || ["suspended", "cancelled"].includes(tenant.status)) return;
  const button = e.buttonId ? await handleButton(tenant, dbCartStore(conv.id), e.buttonId) : null;
  const result = button ?? await runAgent(tenant, await history(conv.id), { cart: dbCartStore(conv.id), greeting: account.greeting, firstMessage: !existed });
  if (result.engine === "claude") await recordUsage(account.tenantId, "ai_chat_turn", { tokensIn: result.tokens?.in, tokensOut: result.tokens?.out, ref: `${conv.id}:${e.wamid}` });
  const fresh = (await db.query.whatsappConversations.findFirst({ where: eq(schema.whatsappConversations.id, conv.id) })) ?? conv;
  // a human may have replied from the WhatsApp Business app while the model was thinking
  if (!aiActive(account, fresh)) return;
  try {
    await sendText(account, fresh, result.reply, "ai");
    if (result.offerButtons && !result.handoff) await sendInteractiveButtons(account, fresh, "Ready to order?", CONFIRM_BUTTONS, "ai");
  } catch (err) {
    console.error("whatsapp send failed", (err as Error).message);
    await flagNeedsHuman(account.tenantId, conv.id, "send_failed");
    return;
  }
  if (result.links.length) await db.update(schema.whatsappConversations).set({ refs: { ...(fresh.refs ?? {}), cartLinks: [...(fresh.refs?.cartLinks ?? []), ...result.links].slice(-20) } }).where(eq(schema.whatsappConversations.id, conv.id));
  if (result.handoff) await db.update(schema.whatsappConversations).set({ aiPausedUntil: pauseUntil(account) }).where(eq(schema.whatsappConversations.id, conv.id));
  const reason = result.needsHuman ?? (result.handoff ? "handoff" : null);
  if (reason) await flagNeedsHuman(account.tenantId, conv.id, reason);
}

/** Owner replied from the WhatsApp Business app (coexistence echo): record it and hand the chat to the human. */
async function handleEcho(e: Extract<WaEvent, { kind: "echo" }>) {
  const account = await accountFor(e.phoneNumberId);
  if (!account) return;
  const ts = new Date(e.timestamp * 1000);
  const conv = await upsertConversation(account, e.to, undefined, { lastMessageAt: ts, aiPausedUntil: pauseUntil(account), needsHuman: false, needsHumanReason: null });
  await db.insert(schema.whatsappMessages).values({ conversationId: conv.id, waMessageId: e.wamid, direction: "out", source: "business_app", type: e.type, body: e.text, raw: e.raw as object }).onConflictDoNothing();
}

async function handleStatus(e: Extract<WaEvent, { kind: "status" }>) {
  await db.update(schema.whatsappMessages).set({ status: e.status }).where(eq(schema.whatsappMessages.waMessageId, e.wamid));
}

export async function processEvents(events: WaEvent[]) {
  // sequential per payload keeps per-chat ordering
  for (const e of events) {
    try {
      if (e.kind === "inbound") await handleInbound(e);
      else if (e.kind === "echo") await handleEcho(e);
      else await handleStatus(e);
    } catch (err) { console.error("whatsapp event failed", e.kind, err); }
  }
}
