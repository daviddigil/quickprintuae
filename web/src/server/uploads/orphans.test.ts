/** DB-backed. Run via `npm test`. */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { createDb } from "@/db/client";
import { provisionTenant } from "@/server/provision";
import { putFile, getFile } from "@/server/storage";
import { purgeOrphanUploads } from "./orphans";

const suffix = Date.now().toString(36);
let tenantId = "";
after(async () => { if (tenantId) await db.delete(schema.tenants).where(eq(schema.tenants.id, tenantId)); });

test("orphans older than 24 h are deleted; referenced files are never purged", async () => {
  const { tenant: t } = await provisionTenant(createDb().db, { shopName: `Orph ${suffix}`, slug: `or${suffix}`, ownerName: "O", ownerEmail: `or${suffix}@t.ae`, ownerPassword: "pw123456" });
  tenantId = t.id;
  const old = new Date(Date.now() - 30 * 3600_000), fresh = new Date(Date.now() - 2 * 3600_000);
  const mk = async (name: string, createdAt: Date) => {
    const storageKey = await putFile(t.id, Buffer.from("data " + name), ".pdf", false);
    const [f] = await db.insert(schema.files).values({ tenantId: t.id, filename: name, storageKey, mime: "application/pdf", size: 5, createdAt }).returning();
    return f;
  };
  const orphan = await mk("orphan.pdf", old);
  const freshOrphan = await mk("fresh.pdf", fresh);
  const quoteFile = await mk("quote.pdf", old);
  const itemFile = await mk("item.pdf", old);
  const jobFile = await mk("job.pdf", old);
  const attached = await mk("attached.pdf", old);
  const verifKey = await putFile(t.id, Buffer.from("licence"), ".pdf", true);
  const [verifFile] = await db.insert(schema.files).values({ tenantId: t.id, filename: "licence.pdf", storageKey: verifKey, mime: "application/pdf", size: 7, createdAt: old, confidential: true }).returning();

  // references
  await db.insert(schema.quoteRequests).values({ tenantId: t.id, name: "Q", phone: "+971501234567", message: "hello there", fileIds: [quoteFile.id] });
  const [order] = await db.insert(schema.orders).values({ tenantId: t.id, number: `O${suffix}`, customerName: "C", customerEmail: "c@t.ae", fulfillment: "pickup", customerPhone: "+971501234567", subtotal: "1", vat: "0", total: "1" } as never).returning();
  await db.insert(schema.orderItems).values({ orderId: order.id, productName: "P", kind: "document", quantity: 1, unitPrice: "1", lineTotal: "1", fileIds: [itemFile.id] } as never);
  await db.update(schema.files).set({ orderId: order.id }).where(eq(schema.files.id, attached.id));
  await db.insert(schema.printJobs).values({ tenantId: t.id, orderId: order.id, fileId: jobFile.id, filename: "job.pdf", ticketNo: `T${suffix}`, options: { color: "bw", sides: "single", paperSize: "A4" } } as never);
  await db.insert(schema.sellerVerifications).values({ tenantId: t.id, legalName: "L", legalNameNorm: `l${suffix}`, licenceNumber: "1", licenceNumberNorm: `1${suffix}`, authority: "DET", documentKey: verifKey } as never);

  const n = await purgeOrphanUploads();
  assert.ok(n >= 1);
  const rows = await db.select().from(schema.files).where(inArray(schema.files.id, [orphan, freshOrphan, quoteFile, itemFile, jobFile, attached, verifFile].map((f) => f.id)));
  const deleted = new Set(rows.filter((r) => r.deletedAt).map((r) => r.filename));
  assert.deepEqual([...deleted], ["orphan.pdf"], "only the old unreferenced upload is purged");
  await assert.rejects(getFile(orphan.storageKey, false), "bytes removed from storage");
  for (const f of [quoteFile, itemFile, jobFile, attached, freshOrphan]) assert.ok(await getFile(f.storageKey, false), `${f.filename} still in storage`);
  assert.ok(await getFile(verifKey, true), "verification document kept");
});
