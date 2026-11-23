import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizePhone, isUaeMobile } from "./phone";

test("UAE formats normalise to +9715…", () => {
  for (const v of ["0501234567", "501234567", "971501234567", "00971501234567", "+971 50 123 4567", "050-123-4567"])
    assert.equal(normalizePhone(v), "+971501234567", v);
  assert.ok(isUaeMobile("+971501234567"));
});
test("international needs +", () => {
  assert.equal(normalizePhone("+44 7700 900123"), "+447700900123");
  assert.equal(normalizePhone("447700900123"), null);
});
test("rejects junk", () => {
  for (const v of ["", "abc", "12", "+971", "+9715012", "0000"]) assert.equal(normalizePhone(v), null, v);
});
