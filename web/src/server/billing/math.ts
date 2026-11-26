/** Pure invoice math (no DB) — unit tested. */
export const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface InvoiceMathInput {
  priceMonthly: number;
  priceYearly: number;
  billingCycle: "monthly" | "yearly" | string;
  orderFeePct: number;
  gmv: number;
  /** precomputed commission (from the per-order ledger); overrides orderFeePct x gmv when given */
  orderFeeAmount?: number;
  /** commission-only shops: no subscription charge */
  subscriptionWaived?: boolean;
  /** pay-as-you-go usage (WhatsApp/Meta, AI) net of VAT */
  usageAmount?: number;
  /** for yearly plans: bill the full year on the anniversary month, nothing otherwise */
  isYearlyBillingMonth?: boolean;
  vatRate?: number;
  /** offer discount on the SUBSCRIPTION line only (ex VAT); clamped to the subscription, applied before VAT */
  discountAmount?: number;
}

export function computeSaasInvoice(i: InvoiceMathInput) {
  const subscription = i.subscriptionWaived ? 0 :
    i.billingCycle === "yearly" ? (i.isYearlyBillingMonth ? i.priceYearly : 0) : i.priceMonthly;
  const orderFee = i.orderFeeAmount !== undefined ? r2(i.orderFeeAmount) : r2((i.gmv * i.orderFeePct) / 100);
  const usage = r2(i.usageAmount ?? 0);
  const discount = r2(Math.min(Math.max(0, i.discountAmount ?? 0), subscription));
  const net = r2(subscription - discount + orderFee + usage);
  const vat = r2((net * (i.vatRate ?? 5)) / 100);
  return { subscription: r2(subscription), discount, orderFee, usage, vat, total: r2(net + vat) };
}

export function periodBounds(date: Date) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
  return { start, end };
}

export const invoiceNumber = (start: Date, seq: number) =>
  `QPI-${start.getUTCFullYear()}${String(start.getUTCMonth() + 1).padStart(2, "0")}-${String(seq).padStart(4, "0")}`;

/** monthly recurring revenue contribution of a tenant */
export const mrrOf = (priceMonthly: number, priceYearly: number, cycle: string) =>
  cycle === "yearly" ? r2(priceYearly / 12) : priceMonthly;
