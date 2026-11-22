/** Pure invoice math (no DB) — unit tested. */
export const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface InvoiceMathInput {
  priceMonthly: number;
  priceYearly: number;
  billingCycle: "monthly" | "yearly" | string;
  orderFeePct: number;
  gmv: number;
  /** for yearly plans: bill the full year on the anniversary month, nothing otherwise */
  isYearlyBillingMonth?: boolean;
  vatRate?: number;
}

export function computeSaasInvoice(i: InvoiceMathInput) {
  const subscription =
    i.billingCycle === "yearly" ? (i.isYearlyBillingMonth ? i.priceYearly : 0) : i.priceMonthly;
  const orderFee = r2((i.gmv * i.orderFeePct) / 100);
  const net = r2(subscription + orderFee);
  const vat = r2((net * (i.vatRate ?? 5)) / 100);
  return { subscription: r2(subscription), orderFee, vat, total: r2(net + vat) };
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
