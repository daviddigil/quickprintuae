import { test } from "node:test";
import assert from "node:assert/strict";
import { computeSaasInvoice, invoiceNumber, periodBounds, mrrOf } from "./math";

test("monthly plan with order fee and VAT", () => {
  const r = computeSaasInvoice({ priceMonthly: 499, priceYearly: 4990, billingCycle: "monthly", orderFeePct: 1, gmv: 18000 });
  assert.deepEqual(r, { subscription: 499, discount: 0, orderFee: 180, usage: 0, vat: 33.95, total: 712.95 });
});
test("yearly plan bills full year only in anniversary month", () => {
  const off = computeSaasInvoice({ priceMonthly: 499, priceYearly: 4990, billingCycle: "yearly", orderFeePct: 1, gmv: 1000 });
  assert.equal(off.subscription, 0);
  assert.equal(off.total, 10.5);
  const on = computeSaasInvoice({ priceMonthly: 499, priceYearly: 4990, billingCycle: "yearly", orderFeePct: 1, gmv: 0, isYearlyBillingMonth: true });
  assert.equal(on.total, 5239.5);
});
test("zero gmv starter", () => {
  assert.equal(computeSaasInvoice({ priceMonthly: 199, priceYearly: 1990, billingCycle: "monthly", orderFeePct: 2, gmv: 0 }).total, 208.95);
});
test("period + numbering + mrr", () => {
  const { start, end } = periodBounds(new Date("2026-11-22T10:00:00Z"));
  assert.equal(start.toISOString(), "2026-11-01T00:00:00.000Z");
  assert.equal(end.toISOString(), "2026-12-01T00:00:00.000Z");
  assert.equal(invoiceNumber(start, 7), "QPI-202611-0007");
  assert.equal(mrrOf(499, 4990, "yearly"), 415.83);
});
test("offer discount applies to the subscription only, before VAT", () => {
  const r = computeSaasInvoice({ priceMonthly: 499, priceYearly: 4990, billingCycle: "monthly", orderFeePct: 1, gmv: 18000, discountAmount: 149.7 });
  assert.equal(r.discount, 149.7);
  assert.equal(r.vat, 26.47); // 5% of (499 - 149.70 + 180)
  assert.equal(r.total, 555.77);
  // never more than the subscription (commission is not discounted)
  const big = computeSaasInvoice({ priceMonthly: 100, priceYearly: 1000, billingCycle: "monthly", orderFeePct: 0, gmv: 0, orderFeeAmount: 50, discountAmount: 999 });
  assert.equal(big.discount, 100); assert.equal(big.total, 52.5);
  const free = computeSaasInvoice({ priceMonthly: 100, priceYearly: 1000, billingCycle: "monthly", orderFeePct: 0, gmv: 0, discountAmount: 100 });
  assert.equal(free.total, 0);
});
