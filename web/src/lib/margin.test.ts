import { test } from "node:test";
import assert from "node:assert/strict";
import { marginAt, marginTone, suggestPrice } from "./margin";

test("suggested price for a target margin", () => {
  assert.equal(suggestPrice(10, 50), 20);
  assert.equal(suggestPrice(12, 40), 20);
  assert.equal(suggestPrice(10, 0), 10);
  assert.equal(suggestPrice(10, 100), 0);
  assert.equal(suggestPrice(-1, 30), 0);
});
test("margin at a price", () => {
  assert.deepEqual(marginAt(10, 25), { profit: 15, marginPct: 60 });
  assert.deepEqual(marginAt(30, 25), { profit: -5, marginPct: -20 });
  assert.deepEqual(marginAt(10, 0), { profit: 0, marginPct: 0 });
});
test("tones", () => {
  assert.equal(marginTone(-1), "loss"); assert.equal(marginTone(10), "thin"); assert.equal(marginTone(25), "healthy");
});
