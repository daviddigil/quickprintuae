/** Pure price helpers for offers (client-safe). AED, ex VAT. */
import { offerDiscount, type OfferLike } from "./offers";

type Terms = Pick<OfferLike, "kind" | "value" | "durationMonths">;
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Discount on ONE subscription charge.
 * monthly: percent/amount/free_months per offerDiscount (a monthly charge).
 * yearly: percent and amount apply to the yearly charge as is ("AED X off" means off the charge);
 *   free_months N converts to N/12 of the yearly charge (capped at the charge).
 * `monthsLeft` = months remaining on the redemption (null = unlimited); only matters for free_months on yearly.
 */
export function chargeDiscount(o: Terms, charge: number, cycle: string, monthsLeft: number | null = null): number {
  if (cycle === "yearly" && o.kind === "free_months") {
    const m = Math.min(12, monthsLeft ?? Math.round(o.value));
    return r2(Math.min(charge, (charge * Math.max(0, m)) / 12));
  }
  return offerDiscount(o, charge);
}

/** How many redemption-months one subscription charge uses up (monthly: 1; a yearly charge covers 12). */
export function monthsConsumed(cycle: string, monthsLeft: number | null): number {
  const per = cycle === "yearly" ? 12 : 1;
  return monthsLeft == null ? per : Math.min(per, monthsLeft);
}

/** Struck-through list price and the discounted first-period price for a plan. */
export function firstChargePrice(o: Terms, listPrice: number, cycle: string) {
  const discount = o.kind === "trial_extension" ? 0 : chargeDiscount(o, listPrice, cycle);
  return { list: listPrice, discounted: r2(listPrice - discount), discount };
}
