/** Seasonal subscription offers: pure rules (client-safe, unit tested). The DB layer is src/server/offers. */
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export const OFFER_KINDS = ["percent", "amount", "free_months", "trial_extension"] as const;
export type OfferKind = (typeof OFFER_KINDS)[number];
export const OFFER_THEMES = ["black_friday", "winter", "summer", "ramadan", "eid", "national_day", "custom"] as const;
export type OfferTheme = (typeof OFFER_THEMES)[number];

export interface OfferLike {
  id: string; name: string; code: string | null; kind: OfferKind | string; value: number; durationMonths: number | null;
  planCodes: string[]; cycles: string[]; audience: "new" | "all" | string;
  startsAt: Date; endsAt: Date; maxRedemptions: number | null; redeemedCount: number; status: "draft" | "active" | "paused" | string;
}

export type OfferState = "draft" | "paused" | "scheduled" | "live" | "ended" | "sold_out";

export function offerState(o: OfferLike, now: Date): OfferState {
  if (o.status === "draft") return "draft";
  if (o.status === "paused") return "paused";
  if (o.endsAt <= now) return "ended";
  if (o.maxRedemptions != null && o.redeemedCount >= o.maxRedemptions) return "sold_out";
  if (o.startsAt > now) return "scheduled";
  return "live";
}

export interface OfferContext { planCode: string; cycle: "monthly" | "yearly" | string; isNewShop: boolean; code?: string | null }

/** Can this shop get this offer right now? A code-protected offer needs the matching code; campaign offers (no code) apply automatically. */
export function offerApplies(o: OfferLike, ctx: OfferContext, now: Date): boolean {
  if (offerState(o, now) !== "live") return false;
  if (o.planCodes.length && !o.planCodes.includes(ctx.planCode)) return false;
  if (o.cycles.length && !o.cycles.includes(ctx.cycle)) return false;
  if (o.audience === "new" && !ctx.isNewShop) return false;
  if (o.code && (ctx.code ?? "").trim().toUpperCase() !== o.code.trim().toUpperCase()) return false;
  return true;
}

/** Discount on ONE subscription charge (AED, ex VAT). Never more than the charge. trial_extension has no money value. */
export function offerDiscount(o: Pick<OfferLike, "kind" | "value">, subscriptionAmount: number): number {
  const base = Math.max(0, subscriptionAmount);
  let d = 0;
  if (o.kind === "percent") d = base * (Math.min(100, Math.max(0, o.value)) / 100);
  else if (o.kind === "amount") d = Math.max(0, o.value);
  else if (o.kind === "free_months") d = base;
  return r2(Math.min(base, d));
}

/** Pick the offer worth most for this shop on its list-price subscription (ties: the one ending sooner). */
export function bestOffer<T extends OfferLike>(offers: T[], ctx: OfferContext, subscriptionAmount: number, now: Date): T | null {
  const ok = offers.filter((o) => offerApplies(o, ctx, now));
  if (!ok.length) return null;
  const value = (o: T) => (o.kind === "trial_extension" ? o.value * 0.01 : offerDiscount(o, subscriptionAmount) * (o.kind === "free_months" ? Math.max(1, o.value) : o.durationMonths ?? 12));
  return [...ok].sort((a, b) => value(b) - value(a) || a.endsAt.getTime() - b.endsAt.getTime())[0];
}

/** Months a new redemption lasts: free_months = value; percent/amount = durationMonths (null = unlimited); trial_extension = none. */
export function redemptionMonths(o: Pick<OfferLike, "kind" | "value" | "durationMonths">): number | null {
  if (o.kind === "free_months") return Math.max(1, Math.round(o.value));
  if (o.kind === "trial_extension") return 0;
  return o.durationMonths ?? null;
}

export function describeOffer(o: Pick<OfferLike, "kind" | "value" | "durationMonths">): string {
  const dur = o.durationMonths ? ` for ${o.durationMonths} month${o.durationMonths === 1 ? "" : "s"}` : "";
  if (o.kind === "percent") return `${o.value}% off your subscription${dur}`;
  if (o.kind === "amount") return `AED ${o.value} off your subscription each month${dur}`;
  if (o.kind === "free_months") return `${Math.round(o.value)} month${Math.round(o.value) === 1 ? "" : "s"} free`;
  if (o.kind === "trial_extension") return `${Math.round(o.value)} extra free trial days`;
  return "";
}

export interface OfferInputIssue { field: string; message: string }
/** Validation used by the superadmin form and the server action. */
export function validateOffer(i: { name: string; kind: string; value: number; durationMonths: number | null; startsAt: Date | null; endsAt: Date | null; maxRedemptions: number | null; code: string | null }): OfferInputIssue[] {
  const out: OfferInputIssue[] = [];
  if (i.name.trim().length < 3) out.push({ field: "name", message: "Give the offer a name (at least 3 characters)" });
  if (!(OFFER_KINDS as readonly string[]).includes(i.kind)) out.push({ field: "kind", message: "Choose a discount type" });
  if (i.kind === "percent" && !(i.value > 0 && i.value <= 100)) out.push({ field: "value", message: "Percent must be between 1 and 100" });
  if (i.kind === "amount" && !(i.value > 0 && i.value <= 100_000)) out.push({ field: "value", message: "Enter an amount in AED" });
  if (i.kind === "free_months" && !(Number.isInteger(i.value) && i.value >= 1 && i.value <= 24)) out.push({ field: "value", message: "Free months must be a whole number from 1 to 24" });
  if (i.kind === "trial_extension" && !(Number.isInteger(i.value) && i.value >= 1 && i.value <= 90)) out.push({ field: "value", message: "Extra trial days must be a whole number from 1 to 90" });
  if (i.durationMonths != null && !(Number.isInteger(i.durationMonths) && i.durationMonths >= 1 && i.durationMonths <= 36)) out.push({ field: "durationMonths", message: "Duration must be 1 to 36 months, or blank for no limit" });
  if (!i.startsAt || !i.endsAt) out.push({ field: "dates", message: "Set the start and end dates" });
  else if (i.endsAt <= i.startsAt) out.push({ field: "dates", message: "The end must be after the start" });
  if (i.maxRedemptions != null && !(Number.isInteger(i.maxRedemptions) && i.maxRedemptions >= 1)) out.push({ field: "maxRedemptions", message: "Limit must be a whole number, or blank for unlimited" });
  if (i.code && !/^[A-Za-z0-9_-]{3,24}$/.test(i.code)) out.push({ field: "code", message: "Code: 3 to 24 letters, numbers, - or _" });
  return out;
}
