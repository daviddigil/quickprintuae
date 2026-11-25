import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { decrypt } from "@/lib/crypto";
import { metaConfig, whatsappFake } from "@/lib/whatsapp-flag";
import type { WhatsappAccount, WhatsappConversation } from "@/db/schema";
import { SERVICE_WINDOW_MS } from "./graph-window";
export { SERVICE_WINDOW_MS };

/** Graph base + version are read at call time (META_GRAPH_BASE lets tests point at a mock server). */
const graph = (path: string) => { const m = metaConfig(); return `${m.graphBase}/${m.graphVersion}${path}`; };

/** Free-form messages are only allowed within 24h of the customer's last message (otherwise a template is required — see docs/WHATSAPP.md). */
export const withinServiceWindow = (c: Pick<WhatsappConversation, "lastCustomerMessageAt">, now = Date.now()) =>
  !!c.lastCustomerMessageAt && now - c.lastCustomerMessageAt.getTime() < SERVICE_WINDOW_MS;

export class GraphError extends Error { constructor(message: string, readonly status?: number) { super(message); } }

async function graphFetch(url: string, init: RequestInit & { token: string }) {
  const { token, ...rest } = init;
  let res: Response;
  try { res = await fetch(url, { ...rest, headers: { ...(rest.headers ?? {}), authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000) }); }
  catch (e) { throw new GraphError(`Could not reach the Meta Graph API (${(e as Error).message})`); }
  const json = await res.json().catch(() => ({})) as Record<string, unknown> & { error?: { message?: string } };
  if (!res.ok) throw new GraphError(json.error?.message ?? `Meta Graph API error (${res.status})`, res.status);
  return json;
}

async function post(account: WhatsappAccount, path: string, body: unknown) {
  const token = decrypt(account.accessTokenEnc) ?? "";
  return graphFetch(graph(path), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), token }) as Promise<{ messages?: { id: string }[] }>;
}

async function record(conv: WhatsappConversation, source: "ai" | "admin", type: string, body: string, wamid: string | null, status: string, raw?: unknown) {
  await db.insert(schema.whatsappMessages).values({ conversationId: conv.id, waMessageId: wamid, direction: "out", source, type, body, status, raw: raw as object });
  await db.update(schema.whatsappConversations).set({ lastMessageAt: new Date() }).where(eq(schema.whatsappConversations.id, conv.id));
}

export const OUTSIDE_WINDOW = "Outside the 24-hour customer service window — WhatsApp only allows an approved template message now.";

async function skipOutsideWindow(conv: WhatsappConversation, source: "ai" | "admin", type: string, text: string): Promise<never> {
  console.warn(`[whatsapp] skipped ${source} message to ${conv.customerWaId}: outside 24h service window`);
  await record(conv, source, type, text, null, "skipped", { skipped: "outside_service_window", reason: OUTSIDE_WINDOW });
  throw new GraphError(OUTSIDE_WINDOW);
}

export async function sendText(account: WhatsappAccount, conv: WhatsappConversation, text: string, source: "ai" | "admin" = "ai") {
  if (!withinServiceWindow(conv)) return skipOutsideWindow(conv, source, "text", text);
  if (whatsappFake()) return record(conv, source, "text", text, null, "sent", { fake: true });
  try {
    const j = await post(account, `/${account.phoneNumberId}/messages`, { messaging_product: "whatsapp", to: conv.customerWaId, type: "text", text: { body: text.slice(0, 4000), preview_url: true } });
    await record(conv, source, "text", text, j.messages?.[0]?.id ?? null, "sent");
  } catch (e) {
    await record(conv, source, "text", text, null, "failed", { error: (e as Error).message });
    throw e;
  }
}

export async function sendInteractiveButtons(account: WhatsappAccount, conv: WhatsappConversation, text: string, buttons: { id: string; title: string }[], source: "ai" | "admin" = "ai") {
  const btns = buttons.slice(0, 3).map((b) => ({ type: "reply", reply: { id: b.id.slice(0, 256), title: b.title.slice(0, 20) } }));
  if (!withinServiceWindow(conv)) return skipOutsideWindow(conv, source, "interactive", text);
  if (whatsappFake()) return record(conv, source, "interactive", text, null, "sent", { fake: true, buttons });
  try {
    const j = await post(account, `/${account.phoneNumberId}/messages`, { messaging_product: "whatsapp", to: conv.customerWaId, type: "interactive", interactive: { type: "button", body: { text: text.slice(0, 1024) }, action: { buttons: btns } } });
    await record(conv, source, "interactive", text, j.messages?.[0]?.id ?? null, "sent");
  } catch (e) {
    await record(conv, source, "interactive", text, null, "failed", { error: (e as Error).message });
    throw e;
  }
}

export async function markRead(account: WhatsappAccount, wamid: string) {
  if (whatsappFake()) return;
  await post(account, `/${account.phoneNumberId}/messages`, { messaging_product: "whatsapp", status: "read", message_id: wamid }).catch(() => {});
}

/* ---------- onboarding helpers ---------- */
export async function exchangeCode(code: string): Promise<string> {
  const m = metaConfig();
  if (!m.appId || !m.appSecret) throw new GraphError("META_APP_ID / META_APP_SECRET are not configured on this platform");
  const url = new URL(graph("/oauth/access_token"));
  url.search = new URLSearchParams({ client_id: m.appId, client_secret: m.appSecret, code }).toString();
  let res: Response;
  try { res = await fetch(url, { signal: AbortSignal.timeout(20_000) }); } catch (e) { throw new GraphError(`Could not reach the Meta Graph API (${(e as Error).message})`); }
  const j = await res.json().catch(() => ({})) as { access_token?: string; error?: { message?: string } };
  if (!res.ok || !j.access_token) throw new GraphError(j.error?.message ?? "Code exchange failed", res.status);
  return j.access_token;
}

export async function subscribeWaba(wabaId: string, token: string) {
  await graphFetch(graph(`/${wabaId}/subscribed_apps`), { method: "POST", token });
}

/** Verifies a token + phone number id against Graph and returns the number's display name (used by both connect flows). */
export async function fetchPhoneInfo(phoneNumberId: string, token: string): Promise<{ displayPhone: string | null; verifiedName: string | null }> {
  const j = await graphFetch(graph(`/${phoneNumberId}?fields=display_phone_number,verified_name`), { token }) as { display_phone_number?: string; verified_name?: string };
  return { displayPhone: j.display_phone_number ?? null, verifiedName: j.verified_name ?? null };
}
