/** Pure payout-ledger maths (AED). Client-safe and unit tested; the DB layer in src/server/payouts uses these. */
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface SettlementInput {
  gross: number;          // what the customer paid (incl. VAT and delivery)
  gatewayFee: number;     // processing fee charged by the gateway on this payment
  commission: number;     // platform commission for this order (from the commission engine)
  recipientPaysFees: boolean;
}

/** Net owed to the shop for one paid order. Never negative. */
export function computeNet(i: SettlementInput): number {
  const fee = i.recipientPaysFees ? i.gatewayFee : 0;
  return Math.max(0, r2(i.gross - i.commission - fee));
}

/** Money is held for `holdDays` after payment so refunds and chargebacks can be covered. */
export const availableAt = (paidAt: Date, holdDays: number) => new Date(paidAt.getTime() + Math.max(0, holdDays) * 86_400_000);

/** Gateway fee estimate when the gateway has not reported the real one yet: pct of gross + fixed. */
export const estimateGatewayFee = (gross: number, pct = 2.9, fixed = 1) => r2(gross * (pct / 100) + fixed);

export interface LedgerRow { id: string; tenantId: string; net: number; status: "pending" | "available" | "batched" | "paid" | "refunded" | "disputed"; availableAt: Date | null }

export interface ShopPayoutState {
  tenantId: string;
  verified: boolean;          // seller verification approved
  accountVerified: boolean;   // payout account approved by superadmin
  payoutHoldUntil: Date | null; // set for 48 h after bank details change
  openDispute: boolean;
}

export interface BatchOptions { now: Date; minPayout: number }

export interface BatchLine { tenantId: string; amount: number; settlementIds: string[]; carriedForward: number }
export interface BatchSkip { tenantId: string; reason: "not_verified" | "account_not_verified" | "bank_details_changed" | "dispute" | "below_minimum" | "negative_balance" | "nothing_available" }

/**
 * Decide which shops get paid in a batch and how much.
 * Available rows (net can be negative for refunds/chargebacks) are summed per shop; a negative or too-small balance carries forward.
 */
export function planBatch(rows: LedgerRow[], shops: ShopPayoutState[], opt: BatchOptions): { lines: BatchLine[]; skipped: BatchSkip[] } {
  const lines: BatchLine[] = [], skipped: BatchSkip[] = [];
  for (const s of shops) {
    const mine = rows.filter((r) => r.tenantId === s.tenantId && r.status === "available" && (!r.availableAt || r.availableAt <= opt.now));
    if (!mine.length) { skipped.push({ tenantId: s.tenantId, reason: "nothing_available" }); continue; }
    if (!s.verified) { skipped.push({ tenantId: s.tenantId, reason: "not_verified" }); continue; }
    if (!s.accountVerified) { skipped.push({ tenantId: s.tenantId, reason: "account_not_verified" }); continue; }
    if (s.payoutHoldUntil && s.payoutHoldUntil > opt.now) { skipped.push({ tenantId: s.tenantId, reason: "bank_details_changed" }); continue; }
    if (s.openDispute) { skipped.push({ tenantId: s.tenantId, reason: "dispute" }); continue; }
    const total = r2(mine.reduce((a, r) => a + r.net, 0));
    if (total < 0) { skipped.push({ tenantId: s.tenantId, reason: "negative_balance" }); continue; }
    if (total < opt.minPayout) { skipped.push({ tenantId: s.tenantId, reason: "below_minimum" }); continue; }
    lines.push({ tenantId: s.tenantId, amount: total, settlementIds: mine.map((r) => r.id), carriedForward: r2(mine.filter((r) => r.net < 0).reduce((a, r) => a + r.net, 0)) });
  }
  return { lines, skipped };
}

export interface BankFileRow { reference: string; accountName: string; bankName: string; iban: string; amount: number }
const csvCell = (v: string | number) => { const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
/** Generic bank transfer CSV (formula-injection safe: cells starting with = + - @ are prefixed). */
export function bankTransferCsv(rows: BankFileRow[]): string {
  const safe = (v: string) => (/^[=+\-@]/.test(v) ? `'${v}` : v);
  const head = ["Reference", "Beneficiary name", "Bank", "IBAN", "Amount (AED)", "Currency"];
  const body = rows.map((r) => [safe(r.reference), safe(r.accountName), safe(r.bankName), r.iban, r.amount.toFixed(2), "AED"].map(csvCell).join(","));
  return [head.join(","), ...body].join("\n") + "\n";
}
