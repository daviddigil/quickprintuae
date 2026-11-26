import "server-only";
import { and, eq, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Tenant } from "@/db/schema";
import { GuardError, hashCardFingerprint } from "@/lib/trust/verification";
import { isBlocked } from "@/server/trust/guards";
import { recordTrustAudit } from "@/server/trust/audit";
import type { CardInfo } from "./types";
import { getTrialDays } from "@/server/platform-settings";


export type SetupResult =
  | { ok: true; started: boolean; tenant: Tenant }
  | { ok: false; code: "card_reused" | "card_blocked" | "failed"; message: string };

/**
 * A card is now on file for this shop (gateway confirmed, or the test-card button).
 * - refuses a card already attached to another non-cancelled shop (one card = one free trial) and blocklisted cards
 * - starts the free trial (length from the superadmin setting) when the shop was 'incomplete'
 * Idempotent: running it twice for the same card changes nothing.
 */
export async function completeCardSetup(tenantId: string, card: CardInfo, source: { gateway: string; eventId?: string }): Promise<SetupResult> {
  const tenant = await db.query.tenants.findFirst({ where: eq(schema.tenants.id, tenantId) });
  if (!tenant) return { ok: false, code: "failed", message: "Shop not found." };
  const hash = hashCardFingerprint(card.fingerprint);

  if (await isBlocked("card_hash", hash)) {
    await markFailed(tenant, "card_blocked");
    await recordTrustAudit("trust.card_blocked", { gateway: source.gateway }, { tenantId });
    return { ok: false, code: "card_blocked", message: new GuardError("card_blocked").message };
  }
  const clash = await db.query.tenants.findFirst({
    where: and(eq(schema.tenants.cardFingerprintHash, hash), ne(schema.tenants.id, tenantId), ne(schema.tenants.status, "cancelled")), columns: { id: true },
  });
  if (clash) {
    await markFailed(tenant, "card_reused");
    // review flag on this shop (never says which other shop); the verification review queue shows it
    await recordTrustAudit("trust.card_reuse", { gateway: source.gateway, otherShops: 1 }, { tenantId });
    return { ok: false, code: "card_reused", message: new GuardError("card_reused").message };
  }

  const same = tenant.cardStatus === "on_file" && tenant.cardFingerprintHash === hash && tenant.billingRef?.paymentMethodId === card.paymentMethodId;
  const starts = tenant.status === "incomplete";
  const ref = { ...tenant.billingRef, cardBrand: card.brand, cardLast4: card.last4, paymentMethodId: card.paymentMethodId, cardGateway: source.gateway,
    ...(card.expMonth && card.expYear ? { cardExp: `${String(card.expMonth).padStart(2, "0")}/${card.expYear}` } : {}) };
  delete (ref as Record<string, string | undefined>).cardError;
  const [row] = await db.update(schema.tenants).set({
    cardStatus: "on_file", cardFingerprintHash: hash, billingRef: ref,
    ...(starts ? { status: "trial" as const, trialEndsAt: new Date(Date.now() + (await getTrialDays()) * 86400_000) } : {}),
  }).where(and(eq(schema.tenants.id, tenantId), starts ? eq(schema.tenants.status, "incomplete") : ne(schema.tenants.status, "cancelled"))).returning();
  const final = row ?? (await db.query.tenants.findFirst({ where: eq(schema.tenants.id, tenantId) }))!;
  // a concurrent webhook + return-URL pair: only the call that flipped incomplete -> trial counts as "started"
  const startedNow = starts && !!row;
  if (!same) await recordTrustAudit(startedNow ? "billing.trial_started" : "billing.card_updated", { gateway: source.gateway, brand: card.brand, last4: card.last4, eventId: source.eventId ?? null }, { tenantId });
  return { ok: true, started: startedNow, tenant: final };
}

/** Setup failed or was refused: the shop stays 'incomplete' (no trial) and the owner sees why. */
export async function markFailed(tenant: Tenant, reason: string) {
  await db.update(schema.tenants).set({ cardStatus: "failed", billingRef: { ...tenant.billingRef, cardError: reason } }).where(and(eq(schema.tenants.id, tenant.id), ne(schema.tenants.cardStatus, "on_file")));
}
