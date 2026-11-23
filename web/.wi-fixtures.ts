import { eq, like } from "drizzle-orm";
import { createDb } from "./src/db/client";
import * as schema from "./src/db/schema";
import { provisionTenant } from "./src/server/provision";

const { db, client } = createDb();
const mode = process.argv[2];
const OPTS = { color: "bw", sides: "single", paperSize: "A4" } as const;

async function job(tenantId: string, ticket: string, name: string, phone: string, status: typeof schema.printJobs.$inferInsert.status, o: { priority?: number; pages?: number; mins?: number; paid?: boolean; verified?: boolean; error?: string } = {}) {
  const paid = o.paid ?? status !== "awaiting_payment";
  const t = new Date(Date.now() - (o.mins ?? 5) * 60000);
  const [cust] = await db.insert(schema.walkInCustomers).values({ tenantId, phone, name, visits: 1, totalSpent: 12.6 }).onConflictDoUpdate({ target: [schema.walkInCustomers.tenantId, schema.walkInCustomers.phone], set: { name } }).returning();
  const [order] = await db.insert(schema.orders).values({ tenantId, number: `FX-${ticket}`, customerName: name, customerEmail: "walkin@invalid", customerPhone: phone, fulfillment: "pickup",
    subtotal: 12, vat: 0.6, total: 12.6, status: paid ? "paid" : "pending_payment", paidAt: paid ? t : null, source: "walk_in", walkInCustomerId: cust.id, ticketNo: ticket, internalNotes: "fixture" }).returning();
  const [f] = await db.insert(schema.files).values({ tenantId, filename: `${name.split(" ")[0]}-doc.pdf`, storageKey: "fixture/none", mime: "application/pdf", size: 100, pageCount: o.pages ?? 4, orderId: order.id }).returning();
  const [j] = await db.insert(schema.printJobs).values({ tenantId, orderId: order.id, fileId: f.id, filename: f.filename, ticketNo: ticket, status, priority: o.priority ?? 0, copies: 1, pages: o.pages ?? 4,
    pagesVerified: o.verified ?? true, options: OPTS, queuedAt: paid ? t : null, startedAt: status === "printing" || status === "printed" ? t : null, finishedAt: status === "printed" ? new Date() : null, error: o.error ?? null, attempts: status === "needs_manual" ? 3 : 0, printerName: status === "printing" ? "HP LaserJet" : null }).returning();
  return j.id;
}

async function main() {
if (mode === "setup") {
  const demo = (await db.query.tenants.findFirst({ where: eq(schema.tenants.slug, "demo") }))!;
  const growth = (await db.query.plans.findFirst({ where: eq(schema.plans.code, "growth") }))!;
  await db.update(schema.tenants).set({ planId: growth.id, status: "active" }).where(eq(schema.tenants.id, demo.id));
  const ids: Record<string, string> = {};
  ids.printing = await job(demo.id, "W-101", "Aisha Printing", "+971501110001", "printing", { mins: 3 });
  ids.q1 = await job(demo.id, "W-102", "Omar Normal", "+971501110002", "queued", { mins: 9, pages: 40 });
  ids.q2 = await job(demo.id, "W-103", "Layla High", "+971501110003", "queued", { mins: 6, pages: 2, priority: 1 });
  ids.q3 = await job(demo.id, "W-104", "Khalid Later", "+971501110004", "queued", { mins: 2, pages: 120 });
  ids.manual = await job(demo.id, "W-105", "Mariam Manual", "+971501110005", "needs_manual", { mins: 20, error: "Printer agent stopped responding", verified: false });
  ids.awaiting = await job(demo.id, "W-106", "Yusuf Unpaid", "+971501110006", "awaiting_payment", { mins: 1 });
  ids.printed = await job(demo.id, "W-107", "Noor Done", "+971501110007", "printed", { mins: 30 });
  // another shop on the Growth plan (isolation) and a Starter shop (locked)
  const other = await provisionTenant(db, { shopName: `Other Fx`, slug: `otherfx${Date.now().toString(36)}`, ownerName: "O", ownerEmail: `o${Date.now()}@other.test`, ownerPassword: "pw123456", planCode: "growth" });
  ids.otherJob = await job(other.tenant.id, "W-900", "Other Cust", "+971509990001", "queued");
  const starter = await provisionTenant(db, { shopName: "Starter Fx", slug: `starterfx${Date.now().toString(36)}`, ownerName: "S", ownerEmail: `s${Date.now()}@starter.test`, ownerPassword: "pw123456", planCode: "starter" });
  console.log(JSON.stringify({ ids, otherTenant: other.tenant.id, starterTenant: starter.tenant.id, starterEmail: starter.owner.email }));
} else if (mode === "cleanup") {
  await db.delete(schema.tenants).where(like(schema.tenants.slug, "otherfx%"));
  await db.delete(schema.tenants).where(like(schema.tenants.slug, "starterfx%"));
  const demo = (await db.query.tenants.findFirst({ where: eq(schema.tenants.slug, "demo") }))!;
  await db.delete(schema.orders).where(like(schema.orders.number, "FX-%"));
  await db.delete(schema.printAgents).where(eq(schema.printAgents.tenantId, demo.id));
  await db.delete(schema.walkInCustomers).where(like(schema.walkInCustomers.phone, "+9715011100%"));
  await db.delete(schema.files).where(eq(schema.files.storageKey, "fixture/none"));
  console.log("cleaned");
}


  await client.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
