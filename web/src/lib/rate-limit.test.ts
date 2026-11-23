import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { rateLimit, resetRateLimits } from "./rate-limit";

beforeEach(() => resetRateLimits());

test("allows up to the limit then blocks with retry-after", () => {
  const t0 = 1_000_000;
  for (let i = 0; i < 3; i++) assert.equal(rateLimit("k", 3, 10_000, t0 + i).ok, true);
  const blocked = rateLimit("k", 3, 10_000, t0 + 5);
  assert.equal(blocked.ok, false);
  assert.ok(blocked.retryAfterSec >= 9 && blocked.retryAfterSec <= 10);
});
test("window slides: old hits expire", () => {
  const t0 = 5_000_000;
  rateLimit("k", 1, 1_000, t0);
  assert.equal(rateLimit("k", 1, 1_000, t0 + 500).ok, false);
  assert.equal(rateLimit("k", 1, 1_000, t0 + 1_001).ok, true);
});
test("keys are independent", () => {
  assert.equal(rateLimit("a", 1, 1_000, 1).ok, true);
  assert.equal(rateLimit("b", 1, 1_000, 1).ok, true);
  assert.equal(rateLimit("a", 1, 1_000, 2).ok, false);
});
