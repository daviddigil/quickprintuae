import { firstChargePrice } from "@/lib/offer-price";
import { offerCopy } from "@/lib/i18n/offers";

/** Plain subset of an offer that is safe to pass to client components. */
export interface PricingOffer { id: string; kind: string; value: number; durationMonths: number | null; planCodes: string[]; cycles: string[]; code: string | null }
export const toPricingOffer = (o: PricingOffer): PricingOffer => ({ id: o.id, kind: o.kind, value: o.value, durationMonths: o.durationMonths, planCodes: o.planCodes, cycles: o.cycles, code: o.code });

/** Struck-through list price and the discounted first payment, for a plan the offer applies to. */
export function OfferPrice({ offer, planCode, listCharge, cycle, locale = "en" }: { offer?: PricingOffer | null; planCode: string; listCharge: number; cycle: "monthly" | "yearly"; locale?: string }) {
  if (!offer || offer.kind === "trial_extension") return null;
  if (offer.planCodes.length && !offer.planCodes.includes(planCode)) return null;
  if (offer.cycles.length && !offer.cycles.includes(cycle)) return null;
  const p = firstChargePrice(offer, listCharge, cycle);
  if (p.discount <= 0) return null;
  const c = offerCopy(locale), n = (x: number) => `AED ${x.toLocaleString("en-AE")}`;
  return (
    <p data-testid="offer-price" className="mt-2 flex flex-wrap items-baseline gap-x-2 text-sm">
      <span className="sr-only">{c.was}: </span><s dir="ltr" className="tabular-nums opacity-75">{n(p.list)}</s>
      <span className="sr-only">{c.now}: </span><strong dir="ltr" className="text-base tabular-nums">{n(p.discounted)}</strong>
      <span className="opacity-80">{c.firstPeriod}</span>
    </p>
  );
}
