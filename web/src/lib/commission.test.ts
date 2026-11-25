import { test } from "node:test";
import assert from "node:assert/strict";
import { computeCommission, resolveRule, commissionBasis, describeRule, type CommissionOverride } from "./commission";

const plan = { orderFeePct: 1, perJobFee: 0, minOrderFee: 0, maxOrderFee: null };

test("percentage only, rounded to fils", () => {
  const r = resolveRule(plan);
  assert.equal(computeCommission(100, 1, r).fee, 1);
  assert.equal(computeCommission(33.33, 1, r).fee, 0.33);
  assert.equal(computeCommission(0, 1, r).fee, 0);
});
test("per-job fee adds up per print job", () => {
  const r = resolveRule({ ...plan, orderFeePct: 0, perJobFee: 0.5 });
  assert.equal(computeCommission(40, 5, r).fee, 2.5);
});
test("minimum and maximum per order", () => {
  const r = resolveRule({ orderFeePct: 2, perJobFee: 0, minOrderFee: 1, maxOrderFee: 20 });
  const small = computeCommission(10, 1, r); assert.equal(small.fee, 1); assert.ok(small.minApplied);
  const big = computeCommission(5000, 1, r); assert.equal(big.fee, 20); assert.ok(big.maxApplied);
});
test("commission can never exceed the order value", () => {
  const r = resolveRule({ orderFeePct: 0, perJobFee: 0, minOrderFee: 5, maxOrderFee: null });
  const c = computeCommission(3, 1, r); assert.equal(c.fee, 3); assert.ok(c.cappedAtBasis);
});
test("override modes", () => {
  const o = (x: Partial<CommissionOverride> & { mode: CommissionOverride["mode"] }) => resolveRule({ orderFeePct: 1, perJobFee: 0.25, minOrderFee: 0, maxOrderFee: null }, x as CommissionOverride);
  assert.equal(o({ mode: "plan" }).pct, 1);
  assert.equal(o({ mode: "none" }).pct, 0); assert.equal(o({ mode: "none" }).perJobFee, 0); assert.equal(o({ mode: "none" }).source, "none"); assert.equal(o({ mode: "none" }).subscriptionWaived, true, "no fees waives the subscription too");
  assert.equal(o({ mode: "subscription_only" }).pct, 0);
  const custom = o({ mode: "custom", pct: 0.5 }); assert.equal(custom.pct, 0.5); assert.equal(custom.perJobFee, 0.25, "blank falls back to the plan"); assert.equal(custom.subscriptionWaived, false);
  const co = o({ mode: "commission_only", pct: 3 }); assert.equal(co.pct, 3); assert.equal(co.subscriptionWaived, true);
  assert.equal(o({ mode: "custom", pct: 0 }).pct, 0, "an explicit 0 is respected, not replaced by the plan value");
  assert.equal(o({ mode: "custom", maxOrderFee: null }).maxOrderFee, null);
});
test("basis excludes VAT (and discount); VAT-inclusive prices are backed out", () => {
  assert.equal(commissionBasis({ subtotal: 100, discount: 10, vatRate: 5, pricesIncludeVat: false }), 90);
  assert.equal(commissionBasis({ subtotal: 105, discount: 0, vatRate: 5, pricesIncludeVat: true }), 100);
});
test("plain-language description", () => {
  assert.equal(describeRule(resolveRule({ orderFeePct: 1, perJobFee: 0.5, minOrderFee: 1, maxOrderFee: 50 })), "1% of order value + AED 0.50 per print job (min AED 1, max AED 50 per order)");
  assert.equal(describeRule(resolveRule(plan, { mode: "none" })), "No fees (subscription and commission waived)");
  assert.match(describeRule(resolveRule(plan, { mode: "commission_only", pct: 3 })), /subscription waived/);
});
