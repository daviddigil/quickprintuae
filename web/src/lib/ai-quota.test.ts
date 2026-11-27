import { test } from "node:test";
import assert from "node:assert/strict";
import { ipLimit, quotaMessage, quotaPeriod, quotaView } from "./ai-quota";

test("quota period is the calendar month in Dubai time", () => {
  assert.equal(quotaPeriod(new Date("2026-11-15T10:00:00Z")), "2026-11");
  assert.equal(quotaPeriod(new Date("2026-11-30T19:59:59Z")), "2026-11");
  assert.equal(quotaPeriod(new Date("2026-11-30T20:00:00Z")), "2026-12"); // 00:00 on 1 Dec in Dubai
  assert.equal(quotaPeriod(new Date("2026-12-31T20:30:00Z")), "2027-01");
});
test("views, ip ceiling and message", () => {
  assert.deepEqual(quotaView(2, 3, "2026-11"), { used: 2, limit: 3, remaining: 1, period: "2026-11" });
  assert.equal(quotaView(5, 3, "p").remaining, 0);
  assert.equal(ipLimit(3), 9); assert.equal(ipLimit(15), 45); assert.equal(ipLimit(-1), 0);
  assert.match(quotaMessage({ limit: 5 }), /all 5 AI designs/);
});
