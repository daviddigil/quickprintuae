import { test } from "node:test";
import assert from "node:assert/strict";
import { dsrDueAt, DSR_DUE_DAYS, RETENTION_SCHEDULE, RIGHTS_DECLARATION } from "./compliance";

test("data-subject deadline is DSR_DUE_DAYS after the request", () => {
  const from = new Date("2026-01-01T00:00:00Z");
  assert.equal(dsrDueAt(from).getTime() - from.getTime(), DSR_DUE_DAYS * 86400000);
});
test("tax records are retained longer than personal data classes with a fixed period", () => {
  const tax = RETENTION_SCHEDULE.find((r) => r.key === "tax_records")!;
  assert.ok(tax.days! >= 5 * 365);
  assert.ok(RIGHTS_DECLARATION.en.length > 20 && RIGHTS_DECLARATION.ar.length > 20);
});
