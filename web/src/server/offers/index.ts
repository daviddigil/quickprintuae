import "server-only";
import { and, asc, desc, eq, gt, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Offer, OfferRedemption, Tenant } from "@/db/schema";
import { bestOffer, offerApplies, offerState, redemptionMonths, type OfferContext } from "@/lib/offers";
import { chargeDiscount } from "@/lib/offer-price";

export type OfferFailure = "invalid" | "expired" | "sold_out" | "not_applicable";
/** Friendly, non-revealing messages (never mention other codes). */
export const OFFER_FAILURE_MESSAGE: Record<OfferFailure, string> = {
  invalid: "That promo code isn't valid. Check the spelling and try again.",
  expired: "This offer is no longer available.",
  sold_out: "This offer has been fully claimed.",
  not_applicable: "This code doesn't apply to the plan or billing cycle you chose.",
};

const g = globalThis as unknown as { __qpOffers?: { at: number; rows: Offer[] } };
export function clearOffersCache() { g.__qpOffers = undefined; }

async function activeRows(now: Date): Promise<Offer[]> {
  const c = g.__qpOffers;
  if (c && now.getTime() - c.at < 30_000 && c.at <= now.getTime()) return c.rows;
  const rows = await db.query.offers.findMany({ where: and(eq(schema.offers.status, "active"), gt(schema.offers.endsAt, now)), orderBy: asc(schema.offers.endsAt) });
  g.__qpOffers = { at: now.getTime(), rows };
  return rows;
}

/** Offers that are live right now (cached ~30 s per process; admin changes clear the cache). */
export async function loadLiveOffers(now = new Date()): Promise<Offer[]> {
  return (await activeRows(now)).filter((o) => offerState(o, now) === "live");
}
/** Live offers that should show as a banner. */
export async function loadBannerOffers(now = new Date()): Promise<Offer[]> {
  return (await loadLiveOffers(now)).filter((o) => o.showBanner);
}

const normCode = (c?: string | null) => (c ?? "").trim();

async function planBy(code: string) { return db.query.plans.findFirst({ where: eq(schema.plans.code, code) }); }
const listCharge = (p: { priceMonthly: number; priceYearly: number }, cycle: string) => (cycle === "yearly" ? p.priceYearly : p.priceMonthly);

export type SignupOfferResult =
  | { ok: true; offer: Offer; auto: boolean; discount: number; list: number; discounted: number; cycle: string }
  | { ok: false; reason: OfferFailure };

/**
 * Resolve the offer a NEW signup gets: a typed promo code, or (no code) the best live campaign offer without a code.
 * No code and no campaign offer: { ok:false, reason:"invalid" } (callers treat that as "nothing to apply").
 */
export async function findOfferForSignup(i: { planCode: string; cycle: string; code?: string | null; now?: Date }): Promise<SignupOfferResult> {
  const now = i.now ?? new Date();
  const ctx: OfferContext = { planCode: i.planCode, cycle: i.cycle, isNewShop: true, code: i.code };
  const plan = await planBy(i.planCode);
  const list = plan ? listCharge(plan, i.cycle) : 0;
  const result = (offer: Offer, auto: boolean): SignupOfferResult => {
    const discount = offer.kind === "trial_extension" ? 0 : chargeDiscount(offer, list, i.cycle);
    return { ok: true, offer, auto, discount, list, discounted: Math.round((list - discount) * 100) / 100, cycle: i.cycle };
  };
  const code = normCode(i.code);
  if (code) {
    const [offer] = await db.select().from(schema.offers).where(sql`upper(${schema.offers.code}) = ${code.toUpperCase()}`).limit(1);
    if (!offer || offer.status === "draft" || offer.status === "paused") return { ok: false, reason: "invalid" };
    const st = offerState(offer, now);
    if (st === "ended") return { ok: false, reason: "expired" };
    if (st === "scheduled") return { ok: false, reason: "invalid" };
    if (st === "sold_out") return { ok: false, reason: "sold_out" };
    if (!offerApplies(offer, ctx, now)) return { ok: false, reason: "not_applicable" };
    return result(offer, false);
  }
  const campaign = (await loadLiveOffers(now)).filter((o) => !o.code);
  const best = bestOffer(campaign, ctx, list, now);
  return best ? result(best, true) : { ok: false, reason: "invalid" };
}

export type RedeemResult = { ok: true; redemption: OfferRedemption } | { ok: false; reason: "sold_out" | "ended" | "already" | "not_found" };
class Abort extends Error { constructor(public reason: "sold_out" | "ended") { super(reason); } }

/**
 * Redeem an offer for a shop. Transactional and race-safe:
 * - unique(offerId, tenantId) makes a second redemption by the same shop a no-op ("already")
 * - a conditional UPDATE of redeemedCount enforces maxRedemptions under parallel calls (and status/dates)
 * - snapshots the terms; trial_extension adds days to tenants.trialEndsAt
 * `graceMs` lets a signup that started before the offer ended still finish the card step.
 */
export async function redeemOffer(tenantId: string, offerOrId: Pick<Offer, "id"> | string, opts: { now?: Date; graceMs?: number; planCode?: string | null } = {}): Promise<RedeemResult> {
  const offerId = typeof offerOrId === "string" ? offerOrId : offerOrId.id;
  const now = opts.now ?? new Date();
  const until = new Date(now.getTime() - (opts.graceMs ?? 0));
  try {
    const out = await db.transaction(async (tx): Promise<RedeemResult> => {
      const offer = await tx.query.offers.findFirst({ where: eq(schema.offers.id, offerId) });
      const tenant = await tx.query.tenants.findFirst({ where: eq(schema.tenants.id, tenantId) });
      if (!offer || !tenant) return { ok: false, reason: "not_found" };
      const plan = tenant.planId ? await tx.query.plans.findFirst({ where: eq(schema.plans.id, tenant.planId) }) : null;
      const [ins] = await tx.insert(schema.offerRedemptions).values({
        offerId, tenantId, planCode: opts.planCode ?? plan?.code ?? null,
        terms: { name: offer.name, kind: offer.kind, value: offer.value, durationMonths: offer.durationMonths },
        monthsRemaining: redemptionMonths(offer), status: offer.kind === "trial_extension" ? "completed" : "active",
      }).onConflictDoNothing().returning();
      if (!ins) return { ok: false, reason: "already" };
      const bumped = await tx.update(schema.offers).set({ redeemedCount: sql`${schema.offers.redeemedCount} + 1`, updatedAt: now }).where(and(
        eq(schema.offers.id, offerId), eq(schema.offers.status, "active"),
        sql`${schema.offers.startsAt} <= ${now.toISOString()}::timestamptz`, sql`${schema.offers.endsAt} > ${until.toISOString()}::timestamptz`,
        sql`(${schema.offers.maxRedemptions} is null or ${schema.offers.redeemedCount} < ${schema.offers.maxRedemptions})`,
      )).returning({ id: schema.offers.id });
      if (!bumped.length) {
        const live = await tx.query.offers.findFirst({ where: eq(schema.offers.id, offerId) });
        throw new Abort(live && live.maxRedemptions != null && live.redeemedCount >= live.maxRedemptions ? "sold_out" : "ended");
      }
      if (offer.kind === "trial_extension" && tenant.status === "trial" && tenant.trialEndsAt) {
        await tx.update(schema.tenants).set({ trialEndsAt: new Date(tenant.trialEndsAt.getTime() + Math.round(offer.value) * 86400_000) }).where(eq(schema.tenants.id, tenantId));
      }
      return { ok: true, redemption: ins };
    });
    if (out.ok) clearOffersCache();
    return out;
  } catch (e) {
    if (e instanceof Abort) return { ok: false, reason: e.reason };
    throw e;
  }
}

/** Cancel a redemption (superadmin): stops future discounts and frees the slot. Extra trial days already granted stay. */
export async function cancelRedemption(redemptionId: string) {
  const out = await db.transaction(async (tx) => {
    const [r] = await tx.update(schema.offerRedemptions).set({ status: "cancelled" }).where(and(eq(schema.offerRedemptions.id, redemptionId), sql`${schema.offerRedemptions.status} <> 'cancelled'`)).returning();
    if (!r) return null;
    await tx.update(schema.offers).set({ redeemedCount: sql`greatest(${schema.offers.redeemedCount} - 1, 0)`, updatedAt: new Date() }).where(eq(schema.offers.id, r.offerId));
    return r;
  });
  clearOffersCache();
  return out;
}

/** Signup path: redeem the offer recorded on the shop at signup (billingRef.pendingOffer). Never throws; idempotent. */
export async function redeemPendingOffer(tenantId: string): Promise<RedeemResult | null> {
  try {
    const t = await db.query.tenants.findFirst({ where: eq(schema.tenants.id, tenantId) });
    const pending = t?.billingRef?.pendingOffer;
    if (!t || !pending) return null;
    const r = await redeemOffer(tenantId, pending, { graceMs: 2 * 3600_000 });
    const { pendingOffer: _drop, ...rest } = t.billingRef; void _drop;
    await db.update(schema.tenants).set({ billingRef: rest }).where(eq(schema.tenants.id, tenantId));
    return r;
  } catch (e) { console.error("redeemPendingOffer failed", e); return null; }
}

/** Existing shops (audience 'all'): live offers this shop can claim (not code-protected unless the code is given). */
export async function listClaimableOffers(tenant: Tenant, now = new Date()): Promise<Offer[]> {
  const plan = tenant.planId ? await db.query.plans.findFirst({ where: eq(schema.plans.id, tenant.planId) }) : null;
  if (!plan) return [];
  const mine = await db.query.offerRedemptions.findMany({ where: eq(schema.offerRedemptions.tenantId, tenant.id), columns: { offerId: true } });
  const done = new Set(mine.map((m) => m.offerId));
  return (await loadLiveOffers(now)).filter((o) => o.audience === "all" && !o.code && !done.has(o.id)
    && offerApplies(o, { planCode: plan.code, cycle: tenant.billingCycle, isNewShop: false }, now)
    && !(o.kind === "trial_extension" && tenant.status !== "trial"));
}

export async function claimOfferForExistingShop(tenantId: string, offerId: string, code?: string | null): Promise<RedeemResult | { ok: false; reason: "not_eligible" }> {
  const tenant = await db.query.tenants.findFirst({ where: eq(schema.tenants.id, tenantId) });
  const offer = await db.query.offers.findFirst({ where: eq(schema.offers.id, offerId) });
  const plan = tenant?.planId ? await db.query.plans.findFirst({ where: eq(schema.plans.id, tenant.planId) }) : null;
  if (!tenant || !offer || !plan || offer.audience !== "all") return { ok: false, reason: "not_eligible" };
  if (!offerApplies(offer, { planCode: plan.code, cycle: tenant.billingCycle, isNewShop: false, code }, new Date())) return { ok: false, reason: "not_eligible" };
  if (offer.kind === "trial_extension" && tenant.status !== "trial") return { ok: false, reason: "not_eligible" };
  return redeemOffer(tenantId, offer, { planCode: plan.code });
}

export async function activeRedemptionFor(tenantId: string) {
  return db.query.offerRedemptions.findFirst({
    where: and(eq(schema.offerRedemptions.tenantId, tenantId), eq(schema.offerRedemptions.status, "active"), sql`(${schema.offerRedemptions.monthsRemaining} is null or ${schema.offerRedemptions.monthsRemaining} > 0)`),
    orderBy: desc(schema.offerRedemptions.createdAt),
  });
}
