/** DB-backed. Run via `npm test`. */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { createDb } from "@/db/client";
import { provisionTenant } from "@/server/provision";
import { canSendMarketing, latestConsent, logConsent, setMarketingOptIn, subjectKeyFor } from "./consent";

const suffix = Date.now().toString(36);
let tid = "";
after(async () => { if (tid) await db.delete(schema.tenants).where(eq(schema.tenants.id, tid)); });

test("canSendMarketing is false unless explicitly opted in, active and not erased", () => {
  assert.equal(canSendMarketing(null), false);
  assert.equal(canSendMarketing({ marketingOptIn: false, active: true }), false);
  assert.equal(canSendMarketing({ marketingOptIn: true, active: false }), false);
  assert.equal(canSendMarketing({ marketingOptIn: true, active: true, anonymisedAt: new Date() }), false);
  assert.equal(canSendMarketing({ marketingOptIn: true, active: true, anonymisedAt: null }), true);
});

test("opt-in and opt-out update the flag and append consent rows", async () => {
  const { tenant } = await provisionTenant(createDb().db, { shopName: `C ${suffix}`, slug: `cn${suffix}`, ownerName: "O", ownerEmail: `cn${suffix}@t.ae`, ownerPassword: "pw123456" });
  tid = tenant.id;
  const [u] = await db.insert(schema.users).values({ tenantId: tid, role: "customer", email: `c${suffix}@c.ae`, name: "C", passwordHash: "x" }).returning();
  assert.equal(u.marketingOptIn, false); // default is off
  assert.equal(await latestConsent(tid, u.id, "marketing_email"), null);
  const on = await setMarketingOptIn(tid, u.id, true, "1.2.3.4");
  assert.ok(on!.marketingOptIn && on!.marketingOptInAt);
  assert.equal(await latestConsent(tid, u.id, "marketing_whatsapp"), true);
  await setMarketingOptIn(tid, u.id, false);
  assert.equal(await latestConsent(tid, u.id, "marketing_email"), false);
  const rows = await db.select().from(schema.consentLogs).where(eq(schema.consentLogs.userId, u.id));
  assert.equal(rows.length, 4);
  assert.ok(rows.every((r) => r.version && (r.ipHash === null || !r.ipHash.includes("1.2.3.4"))));
  // a customer of another shop cannot be changed through this tenant
  assert.equal(await setMarketingOptIn("00000000-0000-0000-0000-000000000000", u.id, true), null);
});

test("anonymous consent is keyed by a hashed email, never the raw address", async () => {
  const row = await logConsent({ tenantId: null, email: "Person@Example.com", purpose: "cookies_analytics", granted: true });
  assert.equal(row.subjectKey, subjectKeyFor("person@example.com"));
  assert.ok(!row.subjectKey!.includes("example"));
  await db.delete(schema.consentLogs).where(eq(schema.consentLogs.id, row.id));
});
