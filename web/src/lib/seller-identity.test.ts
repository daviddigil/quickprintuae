import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSellerIdentity, sellerIdentityLines } from "./seller-identity";

const tenant = { name: "Shop", address: "Shop 4, Al Quoz", emirate: "Dubai", email: "hi@shop.ae", phone: "+97145551234", legalName: "FAKE OWNER TYPED LLC", trn: "999999999999999" };
const ver = { status: "verified", legalName: "Real Printing LLC", licenceNumber: "123456", authority: "Dubai Economy & Tourism", trn: "100234567890003" };

test("identity is built from the verified record, not from owner-typed fields", () => {
  const id = buildSellerIdentity(tenant, ver)!;
  assert.equal(id.tradeName, "Real Printing LLC");
  assert.equal(id.licenceNumber, "123456");
  assert.equal(id.authority, "Dubai Economy & Tourism");
  assert.equal(id.trn, "100234567890003");
  assert.equal(id.address, "Shop 4, Al Quoz, Dubai");
  assert.equal(id.complaintEmail, "hi@shop.ae", "falls back to the shop email");
  assert.equal(buildSellerIdentity({ ...tenant, complaintEmail: "c@shop.ae" }, ver)!.complaintEmail, "c@shop.ae");
});

test("pending, rejected, expired or missing verification yields null (no claims)", () => {
  for (const status of ["pending_review", "rejected", "needs_info", "expired"]) assert.equal(buildSellerIdentity(tenant, { ...ver, status }), null, status);
  assert.equal(buildSellerIdentity(tenant, null), null);
  assert.equal(buildSellerIdentity(tenant, undefined), null);
  assert.equal(buildSellerIdentity(tenant, { ...ver, licenceNumber: " " }), null);
});

test("verified TRN is empty when the seller has none, never the owner-typed one", () => {
  assert.equal(buildSellerIdentity(tenant, { ...ver, trn: null })!.trn, null);
});

test("text lines: unverified shows only the shop name", () => {
  assert.deepEqual(sellerIdentityLines(null, "Shop"), ["Shop"]);
  const lines = sellerIdentityLines(buildSellerIdentity(tenant, ver), "Shop");
  assert.equal(lines[0], "Sold by: Real Printing LLC");
  assert.ok(lines.some((l) => l.includes("123456") && l.includes("Dubai Economy")));
});
