/** DB-backed. Run via `npm test`. */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { createDb } from "@/db/client";
import { provisionTenant } from "@/server/provision";
import { ReportInput, canMoveReport, createReport, updateReport, blockReportedCustomer } from "./reports";

const suffix = Date.now().toString(36);
let tid = "";
const reportIds: string[] = [];
after(async () => { for (const id of reportIds) await db.delete(schema.contentReports).where(eq(schema.contentReports.id, id)); if (tid) await db.delete(schema.tenants).where(eq(schema.tenants.id, tid)); });

test("report validation", () => {
  assert.equal(ReportInput.safeParse({ category: "bogus", description: "long enough text" }).success, false);
  assert.equal(ReportInput.safeParse({ category: "illegal", description: "short" }).success, false);
  assert.equal(ReportInput.safeParse({ category: "illegal", description: "a long enough description", reporterEmail: "nope" }).success, false);
  assert.equal(ReportInput.safeParse({ category: "illegal", description: "a long enough description" }).success, true);
});

test("queue: create, resolve needs a note, status transitions, block customer", async () => {
  const { tenant } = await provisionTenant(createDb().db, { shopName: `R ${suffix}`, slug: `rp${suffix}`, ownerName: "O", ownerEmail: `rp${suffix}@t.ae`, ownerPassword: "pw123456" });
  tid = tenant.id;
  const [u] = await db.insert(schema.users).values({ tenantId: tid, role: "customer", email: `r${suffix}@c.ae`, name: "C", passwordHash: "x" }).returning();
  const num = `R-${suffix}`;
  await db.insert(schema.orders).values({ tenantId: tid, number: num, customerId: u.id, customerName: "C", customerEmail: u.email, customerPhone: "1", fulfillment: "pickup", subtotal: 1, vat: 0, total: 1 } as never);
  const r = await createReport({ category: "counterfeit", description: "Fake brand logo on the print", orderNumber: num, reporterEmail: "Rep@x.ae" } as never);
  reportIds.push(r.id);
  assert.equal(r.status, "open"); assert.equal(r.tenantId, tid); assert.ok(r.orderId); assert.equal(r.reporterEmail, "rep@x.ae");
  assert.equal(canMoveReport("open", "actioned"), true);
  assert.equal((await updateReport(r.id, { status: "actioned" }, u.id)).ok, false);
  const ok = await updateReport(r.id, { status: "actioned", resolution: "Job cancelled" }, u.id);
  assert.ok(ok.ok && ok.report.handledAt);
  const blocked = await blockReportedCustomer(r.id);
  assert.ok(blocked.ok);
  assert.equal((await db.query.users.findFirst({ where: eq(schema.users.id, u.id) }))!.active, false);
  const noOrder = await createReport({ category: "other", description: "general complaint here" } as never); reportIds.push(noOrder.id);
  assert.equal((await blockReportedCustomer(noOrder.id)).ok, false);
});
