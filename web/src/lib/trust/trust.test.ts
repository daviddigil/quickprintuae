import { test } from "node:test";
import assert from "node:assert/strict";
import { validateUaeIban, ibanChecksumOk, maskIban, formatIban } from "./iban";
import { canonicalEmail, isDisposableEmail, nameSimilarity, normaliseBusinessName, normaliseLicence } from "./normalise";

// AE07 0331 2345 6789 0123 456 is the standard published UAE example IBAN
test("UAE IBAN validation", () => {
  assert.equal(ibanChecksumOk("AE07 0331 2345 6789 0123 456"), true);
  const ok = validateUaeIban("ae07 0331 2345 6789 0123 456");
  assert.ok(ok.ok && ok.iban === "AE070331234567890123456" && ok.last4 === "3456");
  assert.equal(validateUaeIban("AE08 0331 2345 6789 0123 456").ok, false); // bad check digits
  assert.equal(validateUaeIban("GB82 WEST 1234 5698 7654 32").ok, false); // not AE
  assert.equal(validateUaeIban("AE07 0331").ok, false); // too short
  assert.equal(validateUaeIban("").ok, false);
  assert.equal(formatIban("AE070331234567890123456"), "AE07 0331 2345 6789 0123 456");
  assert.equal(maskIban("AE070331234567890123456"), "AE07 •••• •••• •••• 3456");
});
test("email canonicalisation catches aliases", () => {
  assert.equal(canonicalEmail("John.Doe+shop@Gmail.com"), "johndoe@gmail.com");
  assert.equal(canonicalEmail("a@googlemail.com"), "a@gmail.com");
  assert.equal(canonicalEmail("Owner+x@company.ae"), "owner@company.ae");
  assert.equal(isDisposableEmail("x@mailinator.com"), true);
  assert.equal(isDisposableEmail("x@company.ae"), false);
});
test("licence numbers and business names normalise to the same key", () => {
  assert.equal(normaliseLicence("CN-1234 567"), normaliseLicence("cn1234567"));
  assert.equal(normaliseBusinessName("Al Noor Printing L.L.C."), normaliseBusinessName("AL NOOR PRINTING LLC"));
  assert.equal(normaliseBusinessName("Al-Noor Printing & Copy Est."), "al noor printing and copy");
  assert.equal(normaliseBusinessName("النور للطباعة ذ.م.م"), normaliseBusinessName("النور للطباعة"));
  assert.notEqual(normaliseBusinessName("Al Noor Printing"), normaliseBusinessName("Al Nour Press"));
});
test("fuzzy name similarity flags near-duplicates", () => {
  assert.ok(nameSimilarity("al noor printing", "al nour printing") > 0.85);
  assert.ok(nameSimilarity("al noor printing", "desco prints") < 0.5);
  assert.equal(nameSimilarity("", "x"), 0);
});
