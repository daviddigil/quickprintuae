import "server-only";
import { and, desc, eq, gt, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { WhatsappAccount, WhatsappConversation } from "@/db/schema";
import { runAgent, type HistoryMsg } from "./agent";
import { markRead, sendText, withinServiceWindow } from "./graph";
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
    if (!r.body) continue;
    const role = r.direction === "in" ? "user" : "assistant";
    const last = msgs[msgs.length - 1];
    if (last && last.role === role) last.content += `\n${r.body}`; else msgs.push({ role, content: r.body });
  }
  while (msgs.length && msgs[0].role !== "user") msgs.shift();
  return msgs;
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

  // per-conversation rate limit on AI replies
  const since = new Date(Date.now() - 10 * 60_000);
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.whatsappMessages)
    .where(and(eq(schema.whatsappMessages.conversationId, conv.id), eq(schema.whatsappMessages.source, "ai"), gt(schema.whatsappMessages.createdAt, since)));
  if (n >= AI_PER_10_MIN) return;

  const tenant = await db.query.tenants.findFirst({ where: eq(schema.tenants.id, account.tenantId) });
  if (!tenant || ["suspended", "cancelled"].includes(tenant.status)) return;
  const result = await runAgent(tenant, await history(conv.id), { greeting: account.greeting, firstMessage: !existed });
  const fresh = (await db.query.whatsappConversations.findFirst({ where: eq(schema.whatsappConversations.id, conv.id) })) ?? conv;
  // a human may have replied from the WhatsApp Business app while the model was thinking
  if (!aiActive(account, fresh)) return;
  await sendText(account, fresh, result.reply, "ai");
  if (result.links.length) await db.update(schema.whatsappConversations).set({ refs: { ...(fresh.refs ?? {}), cartLinks: [...(fresh.refs?.cartLinks ?? []), ...result.links].slice(-20) } }).where(eq(schema.whatsappConversations.id, conv.id));
  if (result.handoff) await db.update(schema.whatsappConversations).set({ aiPausedUntil: pauseUntil(account) }).where(eq(schema.whatsappConversations.id, conv.id));
}

/** Owner replied from the WhatsApp Business app (coexistence echo): record it and hand the chat to the human. */
async function handleEcho(e: Extract<WaEvent, { kind: "echo" }>) {
  const account = await accountFor(e.phoneNumberId);
  if (!account) return;
  const ts = new Date(e.timestamp * 1000);
  const conv = await upsertConversation(account, e.to, undefined, { lastMessageAt: ts, aiPausedUntil: pauseUntil(account) });
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

