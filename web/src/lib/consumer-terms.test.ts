import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveReturnsPolicy, resolveReturnsPolicyBoth, RETURNS_POLICY_TEMPLATE } from "./consumer-terms";

test("blank policy falls back to the marked template (EN and AR)", () => {
  for (const v of [null, undefined, "", "   \n "]) {
    const p = resolveReturnsPolicy(v, "en");
    assert.equal(p.isTemplate, true);
    assert.match(p.text[0], /Template for review/);
  }
  assert.equal(resolveReturnsPolicy("", "ar").text.length, RETURNS_POLICY_TEMPLATE.ar.length);
  assert.equal(RETURNS_POLICY_TEMPLATE.en.length, RETURNS_POLICY_TEMPLATE.ar.length);
});

test("a shop's own text wins and is split into paragraphs", () => {
  const p = resolveReturnsPolicy("No returns on custom items.\n\nReprints within 3 days.", "en");
  assert.equal(p.isTemplate, false);
  assert.deepEqual(p.text, ["No returns on custom items.", "Reprints within 3 days."]);
  assert.equal(resolveReturnsPolicyBoth("x").ar, null);
  assert.ok(resolveReturnsPolicyBoth("").ar);
});
