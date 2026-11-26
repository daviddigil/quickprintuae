/** DB-backed. Run via `npm test`. */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { createDb } from "@/db/client";
import { provisionTenant } from "@/server/provision";
import { loadDirectoryShops } from "./directory";

const suffix = Date.now().toString(36);
const created: string[] = [];
async function shop(name: string, patch: Partial<typeof schema.tenants.$inferInsert> = {}) {
  const { tenant: t } = await provisionTenant(createDb().db, { shopName: name, slug: `dr${suffix}${created.length}`, ownerName: "O", ownerEmail: `d${created.length}${suffix}@t.ae`, ownerPassword: "pw123456" });
  created.push(t.id);
  await db.update(schema.tenants).set({ status: "active", ...patch }).where(eq(schema.tenants.id, t.id));
  return t.slug;
}
after(async () => { for (const id of created) await db.delete(schema.tenants).where(eq(schema.tenants.id, id)); });

test("directory lists live shops only, hides opted-out/suspended/expired, and exposes only public fields", async () => {
  const live = await shop(`Live ${suffix}`, { emirate: "Sharjah", area: "Al Majaz", address: "Blk 4", phone: "+97165550000", whatsapp: "+971 50 111 2222" });
  const hidden = await shop(`Hidden ${suffix}`, { directoryListed: false });
  const suspended = await shop(`Susp ${suffix}`, { status: "suspended" });
  const expired = await shop(`Exp ${suffix}`, { status: "trial", trialEndsAt: new Date(Date.now() - 86400_000), currentPeriodEnd: null });
  const list = await loadDirectoryShops();
  const slugs = list.map((s) => s.slug);
  assert.ok(slugs.includes(live));
  for (const s of [hidden, suspended, expired, "demo"]) assert.ok(!slugs.includes(s), `${s} must not be listed`);
  const row = list.find((s) => s.slug === live)!;
  assert.equal(row.area, "Al Majaz"); assert.equal(row.whatsapp, "971501112222"); assert.ok(row.url.endsWith(`/s/${live}`));
  const keys = Object.keys(row).sort();
  assert.deepEqual(keys, ["address", "area", "color", "emirate", "hours", "logoUrl", "name", "phone", "slug", "url", "whatsapp"]);
});
