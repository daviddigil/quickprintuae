import { test } from "node:test";
import assert from "node:assert/strict";
import { PLAN_FLAGS, parsePlanFlags, displayFeatures, flagLabel } from "./flags";

test("parsePlanFlags accepts known flags, dedupes, rejects unknown", () => {
  assert.deepEqual(parsePlanFlags([]), []);
  assert.deepEqual(parsePlanFlags(["walk_in_queue", "walk_in_queue"]), ["walk_in_queue"]);
  assert.equal(parsePlanFlags(["walk_in_queue", "root_access"]), null);
  assert.equal(parsePlanFlags([42]), null);
});

test("displayFeatures appends a bullet only when the text lacks it", () => {
  const label = flagLabel("walk_in_queue");
  assert.equal(label, PLAN_FLAGS[0].label);
  assert.deepEqual(displayFeatures(["A"], ["walk_in_queue"]), ["A", label]);
  assert.deepEqual(displayFeatures(["A", "Walk-in QR print queue"], ["walk_in_queue"]), ["A", "Walk-in QR print queue"]);
  assert.deepEqual(displayFeatures(["A"], []), ["A"]);
});
