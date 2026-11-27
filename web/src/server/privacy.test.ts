/** DB-backed. Run via `npm test`. */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { eq, and } from "drizzle-orm";
import { db, schema } from "@/db";
import { createDb } from "@/db/client";
import { provisionTenant } from "@/server/provision";
import { putFile } from "@/server/storage";
import { exportCustomerData, eraseCustomer, createDataSubjectRequest, updateDataSubjectRequest, isDsrOverdue, canMoveDsr, ERASED_NAME } from "./privacy";
import { existsSync } from "node:fs";
import path from "node:path";
import { env } from "@/lib/env";

const suffix = Date.now().toString(36);
const created: string[] = [];
async function shop() {
  const { tenant: t } = await provisionTenant(createDb().db, { shopName: `P ${suffix}`, slug: `pv${suffix}${created.length}`, ownerName: "O", ownerEmail: `pv${created.length}${suffix}@t.ae`, ownerPassword: "pw123456" });
  created.push(t.id);
  return t;
}
after(async () => { for (const id of created) await db.delete(schema.tenants).where(eq(schema.tenants.id, id)); });

async function customer(tenantId: string, tag: string) {
  const [u] = await db.insert(schema.users).values({ tenantId, role: "customer", email: `${tag}${suffix}@c.ae`, name: `Cust ${tag}`, phone: "+971501112222", passwordHash: "x", marketingOptIn: true }).returning();
  const key = await putFile(tenantId, Buffer.from(`file ${tag}`), ".png", false);
  const [f] = await db.insert(schema.files).values({ tenantId, userId: u.id, filename: `${tag}.png`, storageKey: key, mime: "image/png", size: 5 }).returning();
  const [o] = await db.insert(schema.orders).values({
    tenantId, number: `N-${tag}${suffix}`, customerId: u.id, customerName: u.name, customerEmail: u.email, customerPhone: "+971501112222", status: "paid", fulfillment: "delivery",
    deliveryAddress: { line1: "1 Street" } as never, notes: "ring bell", subtotal: 100, vat: 5, total: 105,
  } as never).returning();
  await db.insert(schema.orderItems).values({ orderId: o.id, productName: "Flyer", kind: "merchandise", quantity: 10, unitPrice: 10, lineTotal: 100, fileIds: [f.id] } as never);
  await db.insert(schema.quoteRequests).values({ tenantId, name: u.name, phone: "+971501112222", email: u.email, message: "need boxes" });
  await db.insert(schema.consentLogs).values({ tenantId, userId: u.id, purpose: "marketing_email", granted: true });
  return { u, f, o, key };
}

test("export contains only this customer's rows in this tenant", async () => {
  const a = await shop(); const b = await shop();
  const c1 = await customer(a.id, "a1"); const c2 = await customer(a.id, "a2"); const c3 = await customer(b.id, "b1");
  const x = await exportCustomerData(a.id, c1.u.id);
  assert.ok(x);
  assert.equal(x.profile.email, c1.u.email);
  assert.deepEqual(x.orders.map((o) => o.number), [c1.o.number]);
  assert.equal(x.orders[0].items.length, 1);
  assert.deepEqual(x.uploadedFiles.map((f) => f.id), [c1.f.id]);
  assert.equal(x.quoteRequests.length, 1);
  const json = JSON.stringify(x);
  for (const other of [c2, c3]) { assert.ok(!json.includes(other.u.email)); assert.ok(!json.includes(other.o.number)); assert.ok(!json.includes(other.f.id)); }
  assert.ok(!json.includes("passwordHash"));
  // wrong tenant / not a customer
  assert.equal(await exportCustomerData(b.id, c1.u.id), null);
  assert.equal(await exportCustomerData(a.id, c3.u.id), null);
});

test("erase anonymises, deletes files, keeps financial rows, is idempotent and leaves others alone", async () => {
  const a = await shop();
  const c = await customer(a.id, "e1"); const other = await customer(a.id, "e2");
  const full = path.join(path.resolve(env.uploadDir), c.key);
  assert.ok(existsSync(full));
  const r = await eraseCustomer(a.id, c.u.id);
  assert.ok(r.ok && !r.alreadyErased && r.filesDeleted === 1 && r.ordersAnonymised === 1);
  assert.ok(!existsSync(full));
  const u = await db.query.users.findFirst({ where: eq(schema.users.id, c.u.id) });
  assert.equal(u!.name, ERASED_NAME); assert.equal(u!.email, `deleted+${c.u.id}@invalid`); assert.equal(u!.phone, null);
  assert.equal(u!.active, false); assert.ok(u!.anonymisedAt); assert.equal(u!.marketingOptIn, false); assert.notEqual(u!.passwordHash, "x");
  const o = await db.query.orders.findFirst({ where: eq(schema.orders.id, c.o.id) });
  assert.equal(o!.customerName, ERASED_NAME); assert.equal(o!.customerEmail, `deleted+${c.u.id}@invalid`); assert.equal(o!.customerPhone, ""); assert.equal(o!.deliveryAddress, null); assert.equal(o!.notes, null);
  assert.equal(Number(o!.total), 105); assert.equal(Number(o!.vat), 5); assert.equal(o!.number, c.o.number); assert.equal(o!.customerId, c.u.id);
  const items = await db.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, c.o.id));
  assert.equal(items.length, 1); assert.equal(Number(items[0].lineTotal), 100);
  assert.equal((await db.select().from(schema.files).where(eq(schema.files.id, c.f.id))).length, 0);
  const cl = await db.select().from(schema.consentLogs).where(and(eq(schema.consentLogs.tenantId, a.id), eq(schema.consentLogs.purpose, "marketing_email")));
  assert.equal(cl.filter((x) => x.userId === c.u.id).length, 0);
  assert.equal(cl.filter((x) => x.userId === null).length, 1); // the row is kept, the personal link is gone
  const q = await db.select().from(schema.quoteRequests).where(eq(schema.quoteRequests.tenantId, a.id));
  assert.equal(q.filter((x) => x.name === ERASED_NAME).length, 1);
  // idempotent
  const again = await eraseCustomer(a.id, c.u.id);
  assert.ok(again.ok && again.alreadyErased);
  // the other customer is untouched
  const ou = await db.query.users.findFirst({ where: eq(schema.users.id, other.u.id) });
  assert.equal(ou!.name, other.u.name); assert.equal(ou!.active, true);
  assert.equal((await db.select().from(schema.files).where(eq(schema.files.id, other.f.id))).length, 1);
});

test("erase is refused under legal hold (order or shop) and from the wrong tenant", async () => {
  const a = await shop(); const b = await shop();
  const c = await customer(a.id, "h1");
  await db.update(schema.orders).set({ legalHold: true }).where(eq(schema.orders.id, c.o.id));
  assert.deepEqual(await eraseCustomer(a.id, c.u.id), { ok: false, reason: "legal_hold" });
  await db.update(schema.orders).set({ legalHold: false }).where(eq(schema.orders.id, c.o.id));
  await db.update(schema.tenants).set({ legalHold: true }).where(eq(schema.tenants.id, a.id));
  assert.deepEqual(await eraseCustomer(a.id, c.u.id), { ok: false, reason: "legal_hold" });
  assert.deepEqual(await eraseCustomer(b.id, c.u.id), { ok: false, reason: "not_found" });
  const u = await db.query.users.findFirst({ where: eq(schema.users.id, c.u.id) });
  assert.equal(u!.anonymisedAt, null); assert.equal(u!.name, c.u.name);
});

test("data-subject requests: due date, dedupe, transitions, overdue", async () => {
  const a = await shop();
  const { request, created: isNew } = await createDataSubjectRequest({ tenantId: a.id, email: "X@c.ae", kind: "erasure" });
  assert.ok(isNew); assert.equal(request.status, "requested");
  assert.ok(request.dueAt.getTime() > Date.now() + 29 * 86400_000);
  assert.equal((await createDataSubjectRequest({ tenantId: a.id, email: "x@c.ae", kind: "erasure" })).created, false);
  assert.equal(canMoveDsr("completed", "requested"), false);
  const bad = await updateDataSubjectRequest(request.id, { tenantId: a.id }, { status: "completed" }, a.id);
  assert.equal(bad.ok, false); // resolution required
  assert.equal((await updateDataSubjectRequest(request.id, { tenantId: null }, { status: "in_progress" }, a.id)).ok, false); // wrong scope
  const ok = await updateDataSubjectRequest(request.id, { tenantId: a.id }, { status: "completed", resolution: "done" }, a.id);
  assert.ok(ok.ok && ok.request.completedAt);
  assert.equal(isDsrOverdue({ status: "requested", dueAt: new Date(Date.now() - 1000) }), true);
  assert.equal(isDsrOverdue({ status: "completed", dueAt: new Date(Date.now() - 1000) }), false);
});
