import "server-only";
import { createHash } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { ConsentPurpose } from "@/lib/compliance";

/** Version of the cookie / marketing consent wording. Bump when the text changes. */
export const CONSENT_VERSION = "2026-11-27";

const hashIp = (ip?: string | null) => (ip ? createHash("sha256").update(`consent-ip:${ip}`).digest("hex").slice(0, 32) : null);
export const subjectKeyFor = (email: string) => createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 32);

/** Append-only consent record. Grants and withdrawals are both rows, so the history stays provable. */
export async function logConsent(input: { tenantId?: string | null; userId?: string | null; email?: string | null; purpose: ConsentPurpose; granted: boolean; version?: string; ip?: string | null }) {
  const [row] = await db.insert(schema.consentLogs).values({
    tenantId: input.tenantId ?? null, userId: input.userId ?? null,
    subjectKey: !input.userId && input.email ? subjectKeyFor(input.email) : null,
    purpose: input.purpose, granted: input.granted, version: input.version ?? CONSENT_VERSION, ipHash: hashIp(input.ip),
  }).returning();
  return row;
}

/** Latest recorded decision for a purpose (null = never asked). */
export async function latestConsent(tenantId: string, userId: string, purpose: ConsentPurpose) {
  const r = await db.query.consentLogs.findFirst({
    where: and(eq(schema.consentLogs.tenantId, tenantId), eq(schema.consentLogs.userId, userId), eq(schema.consentLogs.purpose, purpose)),
    orderBy: [desc(schema.consentLogs.createdAt)],
  });
  return r ? r.granted : null;
}

/** Customer ticks / unticks "send me offers" (email + WhatsApp). Updates the flag and writes one log row per channel. */
export async function setMarketingOptIn(tenantId: string, userId: string, granted: boolean, ip?: string | null) {
  const [u] = await db.update(schema.users).set({ marketingOptIn: granted, marketingOptInAt: granted ? new Date() : null })
    .where(and(eq(schema.users.id, userId), eq(schema.users.tenantId, tenantId), eq(schema.users.role, "customer"))).returning();
  if (!u) return null;
  for (const purpose of ["marketing_email", "marketing_whatsapp"] as const) await logConsent({ tenantId, userId, purpose, granted, ip });
  return u;
}

/**
 * The ONLY gate for non-transactional (promotional) messages. Transactional messages (order updates, receipts,
 * password reset) do not use it. No promotional sends exist in the codebase today; any future one MUST call this first.
 */
export function canSendMarketing(user: { marketingOptIn: boolean; active: boolean; anonymisedAt?: Date | null } | null | undefined): boolean {
  return !!user && user.marketingOptIn === true && user.active === true && !user.anonymisedAt;
}
