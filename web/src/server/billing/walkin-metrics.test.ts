/** DB-backed. Run via `npm test` (needs NODE_OPTIONS=--conditions=react-server). */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { createDb } from "@/db/client";
import { provisionTenant } from "@/server/provision";
import { walkInMetrics, tenantWalkInStats, periodBounds, hasFeature } from "./index";
import { createAgent } from "@/server/walk-in/agents";

const sfx = Date.now().toString(36);
const created: string[] = [];
after(async () => { for (const id of created) await db.delete(schema.tenants).where(eq(schema.tenants.id, id)); });

test("walk-in metrics are computed from jobs, orders and agents", async () => {
  const { start, end } = periodBounds(new Date());
  const { tenant: t } = await provisionTenant(createDb().db, { shopName: "M", slug: `m${sfx}`, ownerName: "O", ownerEmail: `m${sfx}@t.ae`, ownerPassword: "pw123456", planCode: "growth" });
  created.push(t.id);
  assert.equal(await hasFeature(t, "walk_in_queue"), true);

  const [cust] = await db.insert(schema.walkInCustomers).values({ tenantId: t.id, phone: "+971500000777", name: "W" }).returning();
  const [o] = await db.insert(schema.orders).values({ tenantId: t.id, number: `M-${sfx}`, customerName: "W", customerEmail: "x@invalid", customerPhone: "+971500000777", fulfillment: "pickup", subtotal: 20, vat: 1, total: 21, status: "paid", paidAt: new Date(), source: "walk_in", walkInCustomerId: cust.id, ticketNo: "W-001" }).returning();
  const files = await db.insert(schema.files).values([1, 2].map((i) => ({ tenantId: t.id, filename: `f${i}.pdf`, storageKey: `k/${i}`, mime: "application/pdf", size: 1, orderId: o.id }))).returning();
  const opts = { color: "bw", sides: "single", paperSize: "A4" } as const;
  await db.insert(schema.printJobs).values([
    { tenantId: t.id, orderId: o.id, fileId: files[0].id, filename: "f1.pdf", ticketNo: "W-001", status: "printed", pages: 3, options: opts, queuedAt: new Date(), finishedAt: new Date() },
    { tenantId: t.id, orderId: o.id, fileId: files[1].id, filename: "f2.pdf", ticketNo: "W-001", status: "queued", pages: 5, options: opts, queuedAt: new Date() },
    { tenantId: t.id, orderId: o.id, fileId: files[1].id, filename: "f3.pdf", ticketNo: "W-001", status: "awaiting_payment", pages: 1, options: opts }, // not counted
  ]);
  const { agent } = await createAgent(t.id, "front desk");
  await db.update(schema.printAgents).set({ lastSeenAt: new Date(), printers: ["HP LaserJet"] }).where(eq(schema.printAgents.id, agent.id));
  await createAgent(t.id, "offline pc"); // never seen

  const after = await walkInMetrics(start, end);
  // platform totals include other shops/tests running in parallel, so assert lower bounds; exact numbers are per shop below
  assert.ok(after.jobsThisMonth >= 2 && after.printedThisMonth >= 1 && after.walkInGmvThisMonth >= 21 && after.agentsOnline >= 1 && after.shopsUsing >= 1);

  const s = await tenantWalkInStats(t.id);
  assert.deepEqual([s.jobsThisMonth, s.waiting, s.printedToday, s.customers, s.agents.length], [2, 1, 1, 1, 2]);
});
