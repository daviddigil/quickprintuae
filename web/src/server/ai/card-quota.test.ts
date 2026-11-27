/** DB-backed. Run via `npm test`. */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { createDb } from "@/db/client";
import { provisionTenant } from "@/server/provision";
import { designQuota, ipSubject, planDesignLimit, releaseDesign, reserveDesign, withDesignQuota } from "./card-quota";

const suffix = Date.now().toString(36);
const created: string[] = [];
async function shop(planCode: string) {
  const { tenant: t } = await provisionTenant(createDb().db, { shopName: `Q ${suffix}`, slug: `q${suffix}${created.length}`, ownerName: "O", ownerEmail: `q${created.length}${suffix}@t.ae`, ownerPassword: "pw123456", planCode });
  created.push(t.id);
  return (await db.query.tenants.findFirst({ where: eq(schema.tenants.id, t.id) }))!;
}
after(async () => { for (const id of created) await db.delete(schema.tenants).where(eq(schema.tenants.id, id)); });

test("plan limits: Starter 3, Growth 5, Enterprise 15", async () => {
  assert.equal(await planDesignLimit(await shop("starter")), 3);
  assert.equal(await planDesignLimit(await shop("growth")), 5);
  assert.equal(await planDesignLimit(await shop("enterprise")), 15);
});

test("reservation never exceeds the limit, even in parallel", async () => {
  const t = await shop("starter");
  const results = await Promise.all(Array.from({ length: 12 }, () => reserveDesign(t.id, "v:parallel", 3)));
  assert.equal(results.filter(Boolean).length, 3);
  assert.equal((await designQuota(t.id, "v:parallel", 3)).used, 3);
  assert.equal(await reserveDesign(t.id, "v:parallel", 3), null);
  await releaseDesign(t.id, "v:parallel");
  assert.ok(await reserveDesign(t.id, "v:parallel", 3), "a released design can be used again");
});

test("each customer has their own allowance and the month resets", async () => {
  const t = await shop("starter");
  for (let i = 0; i < 3; i++) assert.ok(await reserveDesign(t.id, "c:a", 3, new Date("2026-11-10T10:00:00Z")));
  assert.equal(await reserveDesign(t.id, "c:a", 3, new Date("2026-11-11T10:00:00Z")), null);
  assert.ok(await reserveDesign(t.id, "c:b", 3, new Date("2026-11-11T10:00:00Z")), "another customer is unaffected");
  assert.ok(await reserveDesign(t.id, "c:a", 3, new Date("2026-12-01T09:00:00Z")), "new month, fresh allowance");
});

test("withDesignQuota keeps the reservation only for real AI designs", async () => {
  const t = await shop("starter");
  const ai = () => Promise.resolve({ source: "ai" as const });
  const tpl = () => Promise.resolve({ source: "template" as const });
  const boom = () => Promise.reject(new Error("model down"));
  const r1 = await withDesignQuota(t, "v:x", "10.0.0.1", ai);
  assert.ok(r1.allowed && r1.quota.used === 1);
  const r2 = await withDesignQuota(t, "v:x", "10.0.0.1", tpl); // fallback: not counted
  assert.ok(r2.allowed && r2.quota.used === 1);
  await assert.rejects(withDesignQuota(t, "v:x", "10.0.0.1", boom)); // failure: not counted
  assert.equal((await designQuota(t.id, "v:x", 3)).used, 1);
  await withDesignQuota(t, "v:x", "10.0.0.1", ai); await withDesignQuota(t, "v:x", "10.0.0.1", ai);
  const r3 = await withDesignQuota(t, "v:x", "10.0.0.1", ai);
  assert.equal(r3.allowed, false); assert.equal(r3.quota.remaining, 0);
});

test("one network cannot hand out unlimited designs by clearing cookies (ip ceiling = 3x)", async () => {
  const t = await shop("starter"); // limit 3 -> ip ceiling 9
  const ai = () => Promise.resolve({ source: "ai" as const });
  let allowed = 0;
  for (let i = 0; i < 12; i++) if ((await withDesignQuota(t, `v:fresh${i}`, "10.9.9.9", ai)).allowed) allowed++;
  assert.equal(allowed, 9);
  assert.equal((await designQuota(t.id, ipSubject("10.9.9.9"), 9)).used, 9);
  // the customer reservation of a refused request was given back
  assert.equal((await designQuota(t.id, "v:fresh11", 3)).used, 0);
});
