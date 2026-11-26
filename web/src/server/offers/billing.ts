import "server-only";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { OfferRedemption } from "@/db/schema";
import { chargeDiscount, monthsConsumed } from "@/lib/offer-price";
import { activeRedemptionFor } from "./index";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface InvoiceDiscountPlan {
  redemption: OfferRedemption; amount: number; consumed: number;
  detail: { offerId: string; name: string; kind: string; amount: number };
}

/**
 * Discount for this tenant's SUBSCRIPTION charge (ex VAT, before VAT). Commission and usage are never discounted.
 * Returns null when there is no active redemption, no subscription this period or the offer has no money value.
 */
export async function planInvoiceDiscount(tenantId: string, subscription: number, cycle: string): Promise<InvoiceDiscountPlan | null> {
  if (subscription <= 0) return null;
  const r = await activeRedemptionFor(tenantId);
  if (!r || r.terms.kind === "trial_extension") return null;
  const amount = chargeDiscount(r.terms, subscription, cycle, r.monthsRemaining);
  if (amount <= 0) return null;
  return { redemption: r, amount, consumed: monthsConsumed(cycle, r.monthsRemaining), detail: { offerId: r.offerId, name: r.terms.name, kind: r.terms.kind, amount } };
}

/** Inside the invoice transaction: use up months, add to the running total, mark completed at 0. */
export async function consumeRedemption(tx: Tx, p: InvoiceDiscountPlan) {
  await tx.update(schema.offerRedemptions).set({
    totalDiscount: sql`${schema.offerRedemptions.totalDiscount} + ${p.amount}`,
    monthsRemaining: sql`case when ${schema.offerRedemptions.monthsRemaining} is null then null else greatest(${schema.offerRedemptions.monthsRemaining} - ${p.consumed}, 0) end`,
    status: sql`case when ${schema.offerRedemptions.monthsRemaining} is not null and ${schema.offerRedemptions.monthsRemaining} - ${p.consumed} <= 0 then 'completed' else ${schema.offerRedemptions.status} end`,
  }).where(eq(schema.offerRedemptions.id, p.redemption.id));
}
