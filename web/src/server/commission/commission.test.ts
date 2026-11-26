/** DB-backed. Run via `npm test`. */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { createDb } from "@/db/client";
import { provisionTenant } from "@/server/provision";
import { markOrderPaid, setOrderStatus } from "@/server/orders";
import { generateInvoicesForPeriod } from "@/server/billing";
import { recordOrderCommission } from "./index";

const suffix = Date.now().toString(36);
const created: string[] = [];
/** a dedicated 1%-commission plan so the numbers below do not depend on the seeded plans */
const PLAN = `cm${suffix}`;
let planId = "";
async function ensureTestPlan() {
  if (planId) return;
  const [p] = await db.insert(schema.plans).values({ code: PLAN, name: "T", priceMonthly: 499, priceYearly: 4990, orderFeePct: 1, sortOrder: 99, active: false }).returning();
  planId = p.id;
}

/** These tests cover the legacy "own" payout mode (commission invoiced). Platform mode (commission netted from payouts) is covered in src/server/payouts/payouts.test.ts. */
async function shop(opts: { status?: "trial" | "active"; override?: unknown } = {}) {
  await ensureTestPlan();
  const { tenant: t } = await provisionTenant(createDb().db, { shopName: `C ${suffix}`, slug: `c${suffix}${created.length}`, ownerName: "O", ownerEmail: `o${created.length}${suffix}@t.ae`, ownerPassword: "pw123456", planCode: PLAN });
  created.push(t.id);
  await db.update(schema.tenants).set({ status: opts.status ?? "active", payoutMode: "own", commissionOverride: (opts.override ?? null) as never }).where(eq(schema.tenants.id, t.id));
  return (await db.query.tenants.findFirst({ where: eq(schema.tenants.id, t.id) }))!;
}
let n = 0;
/** an order awaiting payment; items = number of order lines */
async function order(tenantId: string, subtotal: number, items = 1) {
  const [o] = await db.insert(schema.orders).values({
    tenantId, number: `CM-${suffix}-${n++}`, customerName: "C", customerEmail: "c@t.ae", customerPhone: "+971500000000", fulfillment: "pickup",
    subtotal, vat: subtotal * 0.05, total: subtotal * 1.05, status: "pending_payment",
  }).returning();
  for (let i = 0; i < items; i++) await db.insert(schema.orderItems).values({ orderId: o.id, productName: "Doc", kind: "document", quantity: 1, unitPrice: subtotal / items, lineTotal: subtotal / items });
  return o;
}
const pay = (id: string) => markOrderPaid(id, "mamo", `ref-${id}`);
const comm = (orderId: string) => db.query.orderCommissions.findFirst({ where: eq(schema.orderCommissions.orderId, orderId) });
after(async () => { for (const id of created) await db.delete(schema.tenants).where(eq(schema.tenants.id, id)); if (planId) await db.delete(schema.plans).where(eq(schema.plans.id, planId)); });

test("paying an order records ONE commission with the rule snapshot (Growth plan = 1% of the ex-VAT value)", async () => {
  const t = await shop(); const o = await order(t.id, 200);
  assert.equal(await pay(o.id), true);
  await pay(o.id); await recordOrderCommission(o.id);
  const c = (await comm(o.id))!;
  assert.equal(c.basis, 200); assert.equal(c.fee, 2); assert.equal(c.status, "accrued"); assert.equal(c.ruleSource, "plan"); assert.equal(c.planCode, PLAN);
  assert.equal((await db.select().from(schema.orderCommissions).where(eq(schema.orderCommissions.tenantId, t.id))).length, 1);
});

test("free-trial shops are not charged (stored as waived, fee still shown)", async () => {
  const t = await shop({ status: "trial" }); const o = await order(t.id, 300); await pay(o.id);
  const c = (await comm(o.id))!; assert.equal(c.status, "waived"); assert.equal(c.fee, 3);
});

test("superadmin override applies to NEW orders only; earlier orders keep the rule they were paid under", async () => {
  const t = await shop(); const first = await order(t.id, 100); await pay(first.id);
  await db.update(schema.tenants).set({ commissionOverride: { mode: "custom", pct: 3, perJobFee: 0.5, minOrderFee: 0, maxOrderFee: null } }).where(eq(schema.tenants.id, t.id));
  const second = await order(t.id, 100, 4); await pay(second.id);
  assert.equal((await comm(first.id))!.fee, 1);
  const c2 = (await comm(second.id))!; assert.equal(c2.ruleSource, "custom"); assert.equal(c2.fee, 5); assert.equal(c2.jobs, 4); // 3% of 100 + 4 x 0.50
});

test("'no commission' mode earns nothing", async () => {
  const t = await shop({ override: { mode: "none" } }); const o = await order(t.id, 500); await pay(o.id);
  const c = (await comm(o.id))!; assert.equal(c.fee, 0); assert.equal(c.status, "waived"); assert.equal(c.ruleSource, "none");
});

test("monthly invoice = subscription + the ledger's commission; rows flip to invoiced; running again does nothing", async () => {
  const t = await shop(); const a = await order(t.id, 200), b = await order(t.id, 100); await pay(a.id); await pay(b.id);
  const now = new Date();
  const ids = await generateInvoicesForPeriod(now, { tenantId: t.id });
  assert.equal(ids.length, 1);
  const inv = (await db.query.saasInvoices.findFirst({ where: eq(schema.saasInvoices.id, ids[0]) }))!;
  assert.equal(inv.orderFeeAmount, 3); assert.equal(inv.subscriptionAmount, 499); assert.equal(inv.vat, 25.1); assert.equal(inv.total, 527.1);
  assert.equal((await comm(a.id))!.status, "invoiced"); assert.equal((await comm(a.id))!.invoiceId, inv.id);
  assert.equal((await generateInvoicesForPeriod(now, { tenantId: t.id })).length, 0);
});

test("refunding an order whose commission was already invoiced credits it on the NEXT invoice", async () => {
  const t = await shop(); const o = await order(t.id, 400); await pay(o.id);
  await generateInvoicesForPeriod(new Date(), { tenantId: t.id });
  await setOrderStatus(o.id, "refunded", "customer refund");
  assert.equal((await comm(o.id))!.status, "refunded");
  const d = new Date(); const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 15));
  const [id] = await generateInvoicesForPeriod(next, { tenantId: t.id });
  const inv = (await db.query.saasInvoices.findFirst({ where: eq(schema.saasInvoices.id, id) }))!;
  assert.equal(inv.orderFeeAmount, -4, "credit of the refunded commission"); assert.equal(inv.subscriptionAmount, 499);
  assert.equal((await comm(o.id))!.creditedInvoiceId, inv.id);
  assert.equal((await generateInvoicesForPeriod(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 2, 15)), { tenantId: t.id })).length, 1, "credit is not applied twice");
});

test("refunding BEFORE it was invoiced simply removes the commission from the next invoice", async () => {
  const t = await shop(); const keep = await order(t.id, 100), drop = await order(t.id, 100);
  await pay(keep.id); await pay(drop.id); await setOrderStatus(drop.id, "cancelled");
  const [id] = await generateInvoicesForPeriod(new Date(), { tenantId: t.id });
  assert.equal((await db.query.saasInvoices.findFirst({ where: eq(schema.saasInvoices.id, id) }))!.orderFeeAmount, 1);
});

test("'No fees' shops get no invoice at all (subscription and commission waived)", async () => {
  const t = await shop({ override: { mode: "none" } }); const o = await order(t.id, 250); await pay(o.id);
  assert.equal((await generateInvoicesForPeriod(new Date(), { tenantId: t.id })).length, 0);
});

test("commission-only shops pay no subscription", async () => {
  const t = await shop({ override: { mode: "commission_only", pct: 4 } }); const o = await order(t.id, 250); await pay(o.id);
  const [id] = await generateInvoicesForPeriod(new Date(), { tenantId: t.id });
  const inv = (await db.query.saasInvoices.findFirst({ where: eq(schema.saasInvoices.id, id) }))!;
  assert.equal(inv.subscriptionAmount, 0); assert.equal(inv.orderFeeAmount, 10);
});
