import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { decrypt } from "@/lib/crypto";
import { env } from "@/lib/env";
import { whatsappFake } from "@/lib/whatsapp-flag";
import type { WhatsappAccount, WhatsappConversation } from "@/db/schema";

const graph = (path: string) => `https://graph.facebook.com/${env.metaGraphVersion}${path}`;
import { SERVICE_WINDOW_MS } from "./graph-window";
export { SERVICE_WINDOW_MS };

/** Free-form messages are only allowed within 24h of the customer's last message (otherwise a template is required — TODO, see docs/WHATSAPP.md). */
export const withinServiceWindow = (c: Pick<WhatsappConversation, "lastCustomerMessageAt">, now = Date.now()) =>
  !!c.lastCustomerMessageAt && now - c.lastCustomerMessageAt.getTime() < SERVICE_WINDOW_MS;

async function post(account: WhatsappAccount, path: string, body: unknown) {
  const token = decrypt(account.accessTokenEnc);
  const res = await fetch(graph(path), { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify(body), signal: AbortSignal.timeout(20_000) });
  const json = await res.json().catch(() => ({})) as { messages?: { id: string }[]; error?: { message?: string } };
  if (!res.ok) throw new Error(`Graph ${res.status}: ${json.error?.message ?? "request failed"}`);
  return json;
}

async function record(conv: WhatsappConversation, source: "ai" | "admin", type: string, body: string, wamid: string | null, status: string, raw?: unknown) {
  await db.insert(schema.whatsappMessages).values({ conversationId: conv.id, waMessageId: wamid, direction: "out", source, type, body, status, raw: raw as object });
  await db.update(schema.whatsappConversations).set({ lastMessageAt: new Date() }).where(eq(schema.whatsappConversations.id, conv.id));
}

export async function sendText(account: WhatsappAccount, conv: WhatsappConversation, text: string, source: "ai" | "admin" = "ai") {
  if (!withinServiceWindow(conv)) { await record(conv, source, "text", text, null, "failed", { error: "outside 24h service window; template required" }); throw new Error("Outside the 24-hour customer service window — a template message is required."); }
  if (whatsappFake()) return record(conv, source, "text", text, null, "sent", { fake: true });
  const j = await post(account, `/${account.phoneNumberId}/messages`, { messaging_product: "whatsapp", to: conv.customerWaId, type: "text", text: { body: text.slice(0, 4000), preview_url: true } });
  await record(conv, source, "text", text, j.messages?.[0]?.id ?? null, "sent");
}

export async function sendInteractiveButtons(account: WhatsappAccount, conv: WhatsappConversation, text: string, buttons: { id: string; title: string }[], source: "ai" | "admin" = "ai") {
  const btns = buttons.slice(0, 3).map((b) => ({ type: "reply", reply: { id: b.id.slice(0, 256), title: b.title.slice(0, 20) } }));
  if (!withinServiceWindow(conv)) throw new Error("Outside the 24-hour customer service window.");
  if (whatsappFake()) return record(conv, source, "interactive", text, null, "sent", { fake: true, buttons });
  const j = await post(account, `/${account.phoneNumberId}/messages`, { messaging_product: "whatsapp", to: conv.customerWaId, type: "interactive", interactive: { type: "button", body: { text: text.slice(0, 1024) }, action: { buttons: btns } } });
  await record(conv, source, "interactive", text, j.messages?.[0]?.id ?? null, "sent");
}

export async function markRead(account: WhatsappAccount, wamid: string) {
  if (whatsappFake()) return;
  await post(account, `/${account.phoneNumberId}/messages`, { messaging_product: "whatsapp", status: "read", message_id: wamid }).catch(() => {});
}

/* ---------- onboarding helpers ---------- */
export async function exchangeCode(code: string): Promise<string> {
  if (!env.metaAppId || !env.metaAppSecret) throw new Error("META_APP_ID / META_APP_SECRET not configured");
  const url = new URL(graph("/oauth/access_token"));
  url.search = new URLSearchParams({ client_id: env.metaAppId, client_secret: env.metaAppSecret, code }).toString();
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  const j = await res.json().catch(() => ({})) as { access_token?: string; error?: { message?: string } };
  if (!res.ok || !j.access_token) throw new Error(j.error?.message ?? "Code exchange failed");
  return j.access_token;
}

export async function subscribeWaba(wabaId: string, token: string) {
  const res = await fetch(graph(`/${wabaId}/subscribed_apps`), { method: "POST", headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`Webhook subscription failed (${res.status})`);
}

export async function fetchDisplayPhone(phoneNumberId: string, token: string): Promise<string | null> {
  const res = await fetch(graph(`/${phoneNumberId}?fields=display_phone_number`), { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000) });
  const j = await res.json().catch(() => ({})) as { display_phone_number?: string };
  return j.display_phone_number ?? null;
}
