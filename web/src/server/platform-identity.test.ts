import { test, after } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { normalizePlatformIdentity, platformDocTitle, validatePlatformIdentity, PLATFORM_IDENTITY_KEY } from "@/lib/platform-identity";
import { getPlatformIdentity, setPlatformIdentity } from "./platform-identity";

let saved: unknown;
const hadRow = (async () => { const r = await db.query.platformSettings.findFirst({ where: eq(schema.platformSettings.key, PLATFORM_IDENTITY_KEY) }); saved = r?.value; return !!r; })();
after(async () => {
  if (await hadRow) await db.update(schema.platformSettings).set({ value: saved }).where(eq(schema.platformSettings.key, PLATFORM_IDENTITY_KEY));
  else await db.delete(schema.platformSettings).where(eq(schema.platformSettings.key, PLATFORM_IDENTITY_KEY));
});

test("platform identity validation and document titles", () => {
  const ok = normalizePlatformIdentity({ legalName: " Nexsofture Tech ", trn: "100 2345 6789 0003", address: "Dubai", email: "a@b.ae", vatRegistered: "on" });
  assert.equal(ok.trn, "100234567890003");
  assert.equal(ok.legalName, "Nexsofture Tech");
  assert.equal(validatePlatformIdentity(ok), null);
  assert.match(validatePlatformIdentity({ ...ok, trn: "123" })!, /15/);
  assert.match(validatePlatformIdentity({ ...ok, trn: "" })!, /TRN/);
  assert.equal(validatePlatformIdentity({ ...ok, vatRegistered: false, trn: "" }), null);
  assert.equal(platformDocTitle(ok, "invoice"), "Tax Invoice");
  assert.equal(platformDocTitle({ ...ok, vatRegistered: false }, "credit_note"), "Credit Note");
  assert.equal(platformDocTitle(ok, "credit_note"), "Tax Credit Note");
});

test("platformIdentity setting round-trips through platform_settings", async () => {
  await setPlatformIdentity({ legalName: "Nexsofture Tech FZ", trn: "100234567890003", address: "Dubai, UAE", email: "billing@x.ae", vatRegistered: true });
  assert.deepEqual(await getPlatformIdentity(), { legalName: "Nexsofture Tech FZ", trn: "100234567890003", address: "Dubai, UAE", email: "billing@x.ae", vatRegistered: true });
});
