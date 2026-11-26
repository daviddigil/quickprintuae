import { test } from "node:test";
import assert from "node:assert/strict";
import { GUARD_MESSAGES, VerificationInput, canViewVerificationDocument, computeFlags, hashCardFingerprint, hashIp, isValidTrn, mergeFlags, sniffDocument } from "./verification";

const good = { legalName: "Al Noor Printing LLC", licenceNumber: "CN-1234567", authority: "Dubai Economy & Tourism (DET)", authorityDetail: "", licenceExpiry: "2099-01-31", activity: "Printing services", signatoryName: "Omar Khan", trn: "" };

test("verification input: valid passes, expiry must be in the future, TRN is 15 digits, free zone needs a name", () => {
  assert.ok(VerificationInput.safeParse(good).success);
  assert.ok(!VerificationInput.safeParse({ ...good, licenceExpiry: "2020-01-01" }).success, "expired licence refused");
  assert.ok(!VerificationInput.safeParse({ ...good, licenceExpiry: "31/01/2099" }).success, "bad date");
  assert.ok(isValidTrn("100 0000 0000 0003") && isValidTrn("100-000000000003"));
  assert.ok(VerificationInput.safeParse({ ...good, trn: "100000000000003" }).success);
  assert.ok(!VerificationInput.safeParse({ ...good, trn: "12345" }).success);
  assert.ok(!VerificationInput.safeParse({ ...good, authority: "DMCC / free zone" }).success, "zone name required");
  assert.ok(VerificationInput.safeParse({ ...good, authority: "DMCC / free zone", authorityDetail: "DMCC" }).success);
  assert.ok(!VerificationInput.safeParse({ ...good, authority: "Mars Economic Zone" }).success, "unknown authority");
});

test("document sniffing trusts the bytes, not the name: pdf, jpg, png only", () => {
  assert.equal(sniffDocument(Buffer.from("%PDF-1.7\n%âãÏÓ"))?.ext, ".pdf");
  assert.equal(sniffDocument(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]))?.ext, ".jpg");
  assert.equal(sniffDocument(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))?.ext, ".png");
  assert.equal(sniffDocument(Buffer.from("<html><script>alert(1)</script>")), null);
  assert.equal(sniffDocument(Buffer.from("MZ\x90\x00\x03\x00\x00\x00")), null);
  assert.equal(sniffDocument(Buffer.from("%PDF")), null, "too short");
});

test("review flags: similar names, disposable email, shared network, card reuse; merge keeps one copy", () => {
  assert.deepEqual(computeFlags({ disposableEmail: false, similar: [], sharedIpTenants: [], cardReuse: false }), []);
  const f = computeFlags({ disposableEmail: true, similar: [{ tenantId: "t1", score: 0.9 }, { tenantId: "t2", score: 0.5 }], sharedIpTenants: ["a", "b"], cardReuse: true });
  assert.deepEqual(f, ["disposable_email", "similar_name:t1:0.90", "shared_ip:2", "card_reuse"]);
  assert.deepEqual(mergeFlags(["a", "b"], ["b", "c"]), ["a", "b", "c"]);
});

test("hashes are stable, salted per use and never contain the raw value", () => {
  assert.equal(hashCardFingerprint("fp_1"), hashCardFingerprint("fp_1"));
  assert.notEqual(hashCardFingerprint("fp_1"), hashCardFingerprint("fp_2"));
  assert.match(hashCardFingerprint("fp_1"), /^[0-9a-f]{64}$/);
  assert.ok(!hashIp("203.0.113.9", "pepper").includes("203"));
  assert.notEqual(hashIp("203.0.113.9", "p1"), hashIp("203.0.113.9", "p2"));
});

test("guard messages never name a shop", () => {
  assert.ok(!/\b(slug|tenant|id)\b/i.test(Object.values(GUARD_MESSAGES).join(" ")));
});

test("document access: only the owning shop's owner and superadmins", () => {
  assert.equal(canViewVerificationDocument({ role: "superadmin", tenantId: null }, "T1"), true);
  assert.equal(canViewVerificationDocument({ role: "owner", tenantId: "T1" }, "T1"), true);
  assert.equal(canViewVerificationDocument({ role: "owner", tenantId: "T2" }, "T1"), false, "another shop's owner");
  assert.equal(canViewVerificationDocument({ role: "staff", tenantId: "T1" }, "T1"), false, "staff cannot");
  assert.equal(canViewVerificationDocument({ role: "customer", tenantId: "T1" }, "T1"), false);
  assert.equal(canViewVerificationDocument(null, "T1"), false);
});
