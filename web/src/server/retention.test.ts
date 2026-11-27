/** Retention policy helpers (pure) + legal hold: purge jobs skip held orders and shops. Run via `npm test`. */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { createDb } from "@/db/client";
import { provisionTenant } from "@/server/provision";
import { putFile, getFile } from "@/server/storage";
import { purgeExpiredFiles } from "@/server/orders";
import { purgeOrphanUploads } from "@/server/uploads/orphans";
import { isLegalHeld, isPastRetention, mustKeepRecord, retentionCutoff, retentionRule } from "./retention";

const suffix = Date.now().toString(36);
const created: string[] = [];
after(async () => { for (const id of created) await db.delete(schema.tenants).where(eq(schema.tenants.id, id)); });

test("retention policy helpers follow RETENTION_SCHEDULE", () => {
  const now = new Date("2026-11-27T00:00:00Z");
  assert.equal(retentionRule("tax_records").days, 5 * 365);
  assert.equal(retentionCutoff("customer_personal_data", now), null);
  assert.equal(isPastRetention("customer_personal_data", new Date(0), now), false);
  assert.equal(isPastRetention("ai_prompts", new Date("2026-08-01T00:00:00Z"), now), true);
  assert.equal(isPastRetention("ai_prompts", new Date("2026-11-01T00:00:00Z"), now), false);
  assert.equal(mustKeepRecord("tax_records"), true);
  assert.equal(mustKeepRecord("confidential_files"), false);
  assert.equal(isLegalHeld({}), false);
  assert.equal(isLegalHeld({ orderLegalHold: true }), true);
  assert.equal(isLegalHeld({ tenantLegalHold: true }), true);
});

test("legal hold: expired files of a held order or a held shop are NOT purged; others are; released hold purges later", async () => {
  const { tenant: t } = await provisionTenant(createDb().db, { shopName: `LH ${suffix}`, slug: `lh${suffix}`, ownerName: "O", ownerEmail: `lh${suffix}@t.ae`, ownerPassword: "pw123456" });
  const { tenant: t2 } = await provisionTenant(createDb().db, { shopName: `LH2 ${suffix}`, slug: `lj${suffix}`, ownerName: "O", ownerEmail: `lj${suffix}@t.ae`, ownerPassword: "pw123456" });
  created.push(t.id, t2.id);
  const past = new Date(Date.now() - 3600_000), old = new Date(Date.now() - 30 * 3600_000);
  const mkOrder = async (tenantId: string, n: string, legalHold = false) =>
    (await db.insert(schema.orders).values({ tenantId, number: `LH-${suffix}-${n}`, customerName: "C", customerEmail: "c@t.ae", customerPhone: "+971501234567", fulfillment: "pickup", subtotal: 1, vat: 0, total: 1, legalHold } as never).returning())[0];
  const mkFile = async (tenantId: string, name: string, extra: Partial<typeof schema.files.$inferInsert>) => {
    const storageKey = await putFile(tenantId, Buffer.from("data " + name), ".pdf", false);
    const [f] = await db.insert(schema.files).values({ tenantId, filename: name, storageKey, mime: "application/pdf", size: 5, ...extra }).returning();
    return f;
  };
  const heldOrder = await mkOrder(t.id, "h", true), freeOrder = await mkOrder(t.id, "f"), otherShopOrder = await mkOrder(t2.id, "o");
  const heldFile = await mkFile(t.id, "held.pdf", { orderId: heldOrder.id, deleteAfter: past });
  const freeFile = await mkFile(t.id, "free.pdf", { orderId: freeOrder.id, deleteAfter: past });
  const shopFile = await mkFile(t2.id, "shop.pdf", { orderId: otherShopOrder.id, deleteAfter: past });
  const heldOrphan = await mkFile(t2.id, "orphan.pdf", { createdAt: old });

  await db.update(schema.tenants).set({ legalHold: true }).where(eq(schema.tenants.id, t2.id));
  await purgeExpiredFiles();
  await purgeOrphanUploads();
  const state = async (id: string) => (await db.query.files.findFirst({ where: eq(schema.files.id, id) }))!.deletedAt;
  assert.equal(await state(heldFile.id), null, "held order file kept");
  assert.notEqual(await state(freeFile.id), null, "unheld file purged");
  assert.equal(await state(shopFile.id), null, "held shop's order file kept");
  assert.equal(await state(heldOrphan.id), null, "held shop's orphan upload kept");
  assert.ok(await getFile(heldFile.storageKey, false));
  assert.ok(await getFile(shopFile.storageKey, false));
  await assert.rejects(getFile(freeFile.storageKey, false), "bytes of the unheld file are gone");

  // lifting the holds lets the next run purge them
  await db.update(schema.tenants).set({ legalHold: false }).where(eq(schema.tenants.id, t2.id));
  await db.update(schema.orders).set({ legalHold: false }).where(eq(schema.orders.id, heldOrder.id));
  await purgeExpiredFiles();
  await purgeOrphanUploads();
  assert.notEqual(await state(heldFile.id), null);
  assert.notEqual(await state(shopFile.id), null);
  assert.notEqual(await state(heldOrphan.id), null);
});
