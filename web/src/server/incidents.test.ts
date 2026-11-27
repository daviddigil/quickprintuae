import { test } from "node:test";
import assert from "node:assert/strict";
import { canMoveIncident, notificationChecklist, statusTimestamps } from "./incidents";

const base = { status: "open", containedAt: null, resolvedAt: null };
const now = new Date("2026-11-27T10:00:00Z");

test("containing stamps containedAt; resolving from open stamps both", () => {
  assert.deepEqual(statusTimestamps(base, "contained", now), { containedAt: now, resolvedAt: null });
  assert.deepEqual(statusTimestamps(base, "resolved", now), { containedAt: now, resolvedAt: now });
});
test("existing timestamps are preserved and reopening clears them", () => {
  const earlier = new Date("2026-11-26T10:00:00Z");
  assert.deepEqual(statusTimestamps({ status: "contained", containedAt: earlier, resolvedAt: null }, "resolved", now), { containedAt: earlier, resolvedAt: now });
  assert.deepEqual(statusTimestamps({ status: "resolved", containedAt: earlier, resolvedAt: now }, "open", now), { containedAt: null, resolvedAt: null });
});
test("invalid transitions are refused, same status is allowed", () => {
  assert.equal(canMoveIncident("open", "bogus"), false);
  assert.equal(statusTimestamps(base, "bogus"), null);
  assert.equal(canMoveIncident("contained", "contained"), true);
});
test("notification checklist tracks decision and notifications", () => {
  const c = notificationChecklist({ personalDataInvolved: true, notificationDecision: "Notify", notifiedRegulatorAt: now, notifiedSubjectsAt: null });
  assert.deepEqual(c.map((x) => x.done), [true, true, false]);
  assert.ok(c.every((x) => x.applies));
  assert.ok(notificationChecklist({ personalDataInvolved: false, notificationDecision: null, notifiedRegulatorAt: null, notifiedSubjectsAt: null }).every((x) => !x.applies));
});
