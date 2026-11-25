import { test } from "node:test";
import assert from "node:assert/strict";
import { computeUsageCharges } from "./usage";

test("free allowance is deducted before billing", () => {
  const r = computeUsageCharges({ ai_chat_turn: 250 }, { ai_chat_turn: 0.05 }, { ai_chat_turn: 200 });
  assert.equal(r.lines[0].billedQty, 50);
  assert.equal(r.total, 2.5);
});
test("zero rate means no charge; unknown kinds ignored", () => {
  const r = computeUsageCharges({ whatsapp_message_out: 1000, bogus: 5 }, {}, {});
  assert.equal(r.total, 0);
  assert.equal(r.lines.length, 1);
});
test("allowance larger than usage bills nothing", () => {
  const r = computeUsageCharges({ ai_banner: 3 }, { ai_banner: 1 }, { ai_banner: 10 });
  assert.equal(r.total, 0);
  assert.equal(r.lines[0].included, 3);
});
test("rounds to fils", () => {
  assert.equal(computeUsageCharges({ whatsapp_message_out: 3 }, { whatsapp_message_out: 0.0333 }).total, 0.1);
});
