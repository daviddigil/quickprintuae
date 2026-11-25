/**
 * Commission rules (pure, client-safe: used by the superadmin preview, the server engine and tests).
 * Basis = order value excluding VAT and delivery (after discounts).
 * fee = clamp(basis × pct + jobs × perJobFee, minOrderFee, maxOrderFee), never more than the basis, rounded to fils.
 */
export interface CommissionRule {
  pct: number;
  perJobFee: number;
  minOrderFee: number;
  maxOrderFee: number | null;
  /** subscription is waived (commission-only shops) */
  subscriptionWaived: boolean;
  /** where the rule came from */
  source: "plan" | "custom" | "none";
}

export type CommissionMode = "plan" | "custom" | "commission_only" | "subscription_only" | "none";

/** Per-shop override stored on tenants.commissionOverride. */
export interface CommissionOverride {
  mode: CommissionMode;
  /** custom/commission_only: replace the plan values (blank = use the plan's) */
  pct?: number | null;
  perJobFee?: number | null;
  minOrderFee?: number | null;
  maxOrderFee?: number | null;
  note?: string;
  updatedAt?: string;
  updatedBy?: string;
}

export interface PlanCommission { orderFeePct: number; perJobFee: number; minOrderFee: number; maxOrderFee: number | null }

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const num = (v: number | null | undefined, fallback: number) => (v === null || v === undefined || Number.isNaN(Number(v)) ? fallback : Number(v));

/** Effective rule for a shop: the plan's terms unless the superadmin set an override. */
export function resolveRule(plan: PlanCommission | null | undefined, override?: CommissionOverride | null): CommissionRule {
  const base: CommissionRule = {
    pct: plan?.orderFeePct ?? 0, perJobFee: plan?.perJobFee ?? 0, minOrderFee: plan?.minOrderFee ?? 0, maxOrderFee: plan?.maxOrderFee ?? null,
    subscriptionWaived: false, source: "plan",
  };
  const mode = override?.mode ?? "plan";
  if (mode === "plan") return base;
  if (mode === "none") return { pct: 0, perJobFee: 0, minOrderFee: 0, maxOrderFee: null, subscriptionWaived: true, source: "none" };
  if (mode === "subscription_only") return { pct: 0, perJobFee: 0, minOrderFee: 0, maxOrderFee: null, subscriptionWaived: false, source: "custom" };
  // custom + commission_only: overridden values fall back to the plan's when left blank
  return {
    pct: num(override?.pct, base.pct), perJobFee: num(override?.perJobFee, base.perJobFee), minOrderFee: num(override?.minOrderFee, base.minOrderFee),
    maxOrderFee: override?.maxOrderFee === undefined ? base.maxOrderFee : override.maxOrderFee,
    subscriptionWaived: mode === "commission_only", source: "custom",
  };
}

export interface CommissionResult { pctFee: number; jobFee: number; fee: number; minApplied: boolean; maxApplied: boolean; cappedAtBasis: boolean }

export function computeCommission(basis: number, jobs: number, rule: CommissionRule): CommissionResult {
  const b = Math.max(0, basis);
  if (b <= 0 || (rule.pct <= 0 && rule.perJobFee <= 0 && rule.minOrderFee <= 0)) return { pctFee: 0, jobFee: 0, fee: 0, minApplied: false, maxApplied: false, cappedAtBasis: false };
  const pctFee = r2((b * rule.pct) / 100);
  const jobFee = r2(Math.max(0, jobs) * rule.perJobFee);
  let fee = r2(pctFee + jobFee);
  let minApplied = false, maxApplied = false, cappedAtBasis = false;
  if (rule.minOrderFee > 0 && fee < rule.minOrderFee) { fee = r2(rule.minOrderFee); minApplied = true; }
  if (rule.maxOrderFee !== null && rule.maxOrderFee >= 0 && fee > rule.maxOrderFee) { fee = r2(rule.maxOrderFee); maxApplied = true; }
  if (fee > b) { fee = r2(b); cappedAtBasis = true; }
  return { pctFee, jobFee, fee, minApplied, maxApplied, cappedAtBasis };
}

/** Order value excluding VAT, used as the commission basis. */
export function commissionBasis(o: { subtotal: number; discount: number; vatRate: number; pricesIncludeVat: boolean }) {
  const net = Math.max(0, o.subtotal - o.discount);
  return r2(o.pricesIncludeVat ? net / (1 + o.vatRate / 100) : net);
}

/** Human-readable summary, e.g. "1% of order value + AED 0.50 per print job (min AED 1, max AED 50)". */
export function describeRule(rule: CommissionRule, aed: (n: number) => string = (n) => `AED ${n.toFixed(2).replace(/\.00$/, "")}`): string {
  const parts: string[] = [];
  if (rule.pct > 0) parts.push(`${rule.pct}% of order value`);
  if (rule.perJobFee > 0) parts.push(`${aed(rule.perJobFee)} per print job`);
  if (!parts.length) return rule.source === "none" ? "No fees (subscription and commission waived)" : "No commission on orders";
  const lim: string[] = [];
  if (rule.minOrderFee > 0) lim.push(`min ${aed(rule.minOrderFee)}`);
  if (rule.maxOrderFee !== null) lim.push(`max ${aed(rule.maxOrderFee)}`);
  return `${parts.join(" + ")}${lim.length ? ` (${lim.join(", ")} per order)` : ""}${rule.subscriptionWaived ? "; subscription waived" : ""}`;
}
