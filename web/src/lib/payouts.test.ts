import { test } from "node:test";
import assert from "node:assert/strict";
import { availableAt, bankTransferCsv, computeNet, estimateGatewayFee, planBatch, type LedgerRow, type ShopPayoutState } from "./payouts";

test("net owed = gross - commission - gateway fee (if the shop bears it), never negative", () => {
  assert.equal(computeNet({ gross: 105, gatewayFee: 4.05, commission: 3, recipientPaysFees: true }), 97.95);
  assert.equal(computeNet({ gross: 105, gatewayFee: 4.05, commission: 3, recipientPaysFees: false }), 102);
  assert.equal(computeNet({ gross: 2, gatewayFee: 4, commission: 3, recipientPaysFees: true }), 0);
  assert.equal(estimateGatewayFee(100), 3.9);
});
test("hold days", () => {
  const paid = new Date("2026-11-01T10:00:00Z");
  assert.equal(availableAt(paid, 3).toISOString(), "2026-11-04T10:00:00.000Z");
  assert.equal(availableAt(paid, 0).getTime(), paid.getTime());
});

const now = new Date("2026-11-10T00:00:00Z");
const row = (id: string, tenantId: string, net: number, over: Partial<LedgerRow> = {}): LedgerRow => ({ id, tenantId, net, status: "available", availableAt: new Date("2026-11-05T00:00:00Z"), ...over });
const shop = (tenantId: string, over: Partial<ShopPayoutState> = {}): ShopPayoutState => ({ tenantId, verified: true, accountVerified: true, payoutHoldUntil: null, openDispute: false, ...over });

test("batch pays verified shops, carries refunds, skips the rest with a reason", () => {
  const rows = [row("1", "A", 100), row("2", "A", -20), row("3", "B", 50), row("4", "C", 80), row("5", "D", 10), row("6", "E", -30), row("7", "F", 60), row("8", "G", 40, { availableAt: new Date("2026-11-20T00:00:00Z") }), row("9", "H", 70)];
  const shops = [shop("A"), shop("B", { verified: false }), shop("C", { accountVerified: false }), shop("D"), shop("E"), shop("F", { payoutHoldUntil: new Date("2026-11-11T00:00:00Z") }), shop("G"), shop("H", { openDispute: true })];
  const { lines, skipped } = planBatch(rows, shops, { now, minPayout: 25 });
  assert.deepEqual(lines, [{ tenantId: "A", amount: 80, settlementIds: ["1", "2"], carriedForward: -20 }]);
  const why = Object.fromEntries(skipped.map((s) => [s.tenantId, s.reason]));
  assert.deepEqual(why, { B: "not_verified", C: "account_not_verified", D: "below_minimum", E: "negative_balance", F: "bank_details_changed", G: "nothing_available", H: "dispute" });
});
test("bank file is CSV-injection safe", () => {
  const csv = bankTransferCsv([{ reference: "PO-1", accountName: '=HYPERLINK("x")', bankName: "Mashreq, Dubai", iban: "AE070331234567890123456", amount: 80 }]);
  assert.ok(csv.includes("'=HYPERLINK"));
  assert.ok(csv.includes('"Mashreq, Dubai"'));
  assert.ok(csv.includes("80.00,AED"));
});
