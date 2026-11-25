import "server-only";
import { createHash, timingSafeEqual } from "crypto";
import { eq, inArray, isNotNull, and } from "drizzle-orm";
import { db, schema } from "@/db";
import { decrypt } from "@/lib/crypto";
import { getMetaPlatformConfig } from "./platform-config";
import { verifySignature } from "./signature";

export type WebhookAuth = { ok: true; via: "platform" | "account" } | { ok: false; status: 401 | 503; error: string };

const sha = (s: string) => createHash("sha256").update(s).digest();
const safeEq = (a: string, b: string) => timingSafeEqual(sha(a), sha(b));

/** phone_number_ids mentioned in a payload (only used to choose WHICH secret to verify with — nothing is trusted before the HMAC passes). */
function phoneIds(raw: string): string[] {
  try {
    const p = JSON.parse(raw) as { entry?: { changes?: { value?: { metadata?: { phone_number_id?: string } } }[] }[] };
    const ids = new Set<string>();
    for (const e of p.entry ?? []) for (const c of e.changes ?? []) { const id = c.value?.metadata?.phone_number_id; if (id) ids.add(String(id)); }
    return [...ids];
  } catch { return []; }
}

/**
 * Signature check over the RAW body (X-Hub-Signature-256):
 *  1. platform Meta app secret (Embedded Signup shops), or
 *  2. the shop's own app secret (manual connect) — and then ONLY for that shop's phone numbers.
 * Nothing unsigned is ever processed. With no platform secret and no matching shop secret → 503 "not configured".
 */
export async function authenticateWebhook(raw: string, signature: string | null): Promise<WebhookAuth> {
  const platform = (await getMetaPlatformConfig()).appSecret;
  if (platform && verifySignature(raw, signature, platform)) return { ok: true, via: "platform" };

  const ids = phoneIds(raw);
  if (ids.length) {
    const accts = await db.select().from(schema.whatsappAccounts).where(and(inArray(schema.whatsappAccounts.phoneNumberId, ids), isNotNull(schema.whatsappAccounts.appSecretEnc)));
    const verified = accts.filter((a) => verifySignature(raw, signature, decrypt(a.appSecretEnc) ?? undefined)).map((a) => a.phoneNumberId);
    if (verified.length === ids.length) return { ok: true, via: "account" };
  }
  return platform ? { ok: false, status: 401, error: "Invalid signature" } : { ok: false, status: 503, error: "WhatsApp is not configured on this platform" };
}

/** GET handshake: the platform token, or a verify token generated for a manual-connect shop. */
export async function verifyTokenValid(token: string | null): Promise<boolean> {
  if (!token) return false;
  const platform = (await getMetaPlatformConfig()).verifyToken;
  if (platform && safeEq(platform, token)) return true;
  const row = await db.query.whatsappAccounts.findFirst({ where: eq(schema.whatsappAccounts.verifyToken, token) });
  return !!row;
}

export async function touchWebhook(raw: string) {
  const ids = phoneIds(raw);
  if (ids.length) await db.update(schema.whatsappAccounts).set({ lastWebhookAt: new Date() }).where(inArray(schema.whatsappAccounts.phoneNumberId, ids));
}
