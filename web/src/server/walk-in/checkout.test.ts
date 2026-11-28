/** Run: NODE_OPTIONS=--conditions=react-server npx tsx --tsconfig tsconfig.json --test --test-force-exit src/server/walk-in/checkout.test.ts */
process.env.PAYMENTS_FAKE = "1"; // checkout needs a payment provider: platform gateways are simulated in tests
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { createDb } from "@/db/client";
import { provisionTenant } from "@/server/provision";
import { CheckoutError, createWalkInOrder, type WalkInCheckoutInputT } from "@/server/checkout";
import { markOrderPaid } from "@/server/orders";
import { computeLinePrice } from "@/lib/pricing";

const suffix = Date.now().toString(36);
const created: string[] = [];
/** A plan WITHOUT the walk_in_queue flag (all real plans include it now), to test the feature lock. */
const NOFLAG = `noflag-${suffix}`;
async function ensureNoFlagPlan() {
  if (!(await db.query.plans.findFirst({ where: eq(schema.plans.code, NOFLAG) })))
    await db.insert(schema.plans).values({ code: NOFLAG, name: "No flag (test)", priceMonthly: 1, priceYearly: 1, flags: [], features: [], active: false });
}


async function shop(opts: { plan?: string; walkIn?: Record<string, unknown> | false } = {}) {
  if (opts.plan === NOFLAG) await ensureNoFlagPlan();
  const { tenant: t } = await provisionTenant(createDb().db, { shopName: `W ${suffix}`, slug: `w${suffix}${created.length}`, ownerName: "O", ownerEmail: `o${created.length}${suffix}@t.ae`, ownerPassword: "pw123456", planCode: opts.plan ?? "growth", verified: true });
  created.push(t.id);
  const settings = { ...t.settings, payments: { stripe: { enabled: true, secretKeyEnc: "x" } }, walkIn: opts.walkIn === false ? undefined : { enabled: true, ...(opts.walkIn ?? {}) } };
  const [row] = await db.update(schema.tenants).set({ settings: settings as never }).where(eq(schema.tenants.id, t.id)).returning();
  return row;
}
async function file(tenantId: string, filename: string, pageCount: number | null, extra: Partial<typeof schema.files.$inferInsert> = {}) {
  const [f] = await db.insert(schema.files).values({ tenantId, filename, storageKey: `k/${Math.random()}`, mime: "application/pdf", size: 10, pageCount, ...extra }).returning();
  return f;
}
const input = (files: WalkInCheckoutInputT["files"], extra: Partial<WalkInCheckoutInputT> = {}): WalkInCheckoutInputT => ({ name: "Aisha Test", phone: "050 123 4567", provider: "stripe", files, rightsDeclared: true, ...extra });
const rejects = (p: Promise<unknown>, re: RegExp) => assert.rejects(p, (e: Error) => e instanceof CheckoutError && re.test(e.message));

after(async () => { for (const id of created) await db.delete(schema.tenants).where(eq(schema.tenants.id, id)); await db.delete(schema.plans).where(eq(schema.plans.code, NOFLAG)); });

test("happy path: priced server-side, jobs awaiting payment, pages verified flags, no visit yet", async () => {
  const t = await shop();
  const pdf = await file(t.id, "a.pdf", 3), docx = await file(t.id, "b.docx", null);
  const order = await createWalkInOrder(t, input([
    { fileId: pdf.id, copies: 2, color: "color", sides: "double", paperSize: "A4" },
    { fileId: docx.id, copies: 1, color: "bw", sides: "single", paperSize: "A4", pages: 7 },
  ]));
  assert.equal(order.source, "walk_in"); assert.equal(order.fulfillment, "pickup"); assert.equal(order.status, "pending_payment");
  assert.equal(order.ticketNo, "W-001"); assert.equal(order.customerPhone, "+971501234567"); assert.equal(order.slotStart, null);
  const product = (await db.query.products.findFirst({ where: and(eq(schema.products.tenantId, t.id), eq(schema.products.kind, "document")) }))!;
  const expected = computeLinePrice(product.config, { paper_size: "A4", color: "color", sides: "double" }, 2, 3).lineTotal + computeLinePrice(product.config, { paper_size: "A4", color: "bw", sides: "single" }, 1, 7).lineTotal;
  assert.equal(order.subtotal, Math.round(expected * 100) / 100);
  assert.equal(order.deliveryFee, 0);
  const jobs = await db.select().from(schema.printJobs).where(eq(schema.printJobs.orderId, order.id));
  assert.equal(jobs.length, 2);
  assert.ok(jobs.every((j) => j.status === "awaiting_payment" && j.ticketNo === "W-001" && j.orderItemId));
  assert.deepEqual(jobs.map((j) => [j.filename, j.pages, j.pagesVerified]).sort(), [["a.pdf", 3, true], ["b.docx", 7, false]]);
  assert.equal((await db.select().from(schema.files).where(eq(schema.files.orderId, order.id))).length, 2);
  const [c] = await db.select().from(schema.walkInCustomers).where(eq(schema.walkInCustomers.id, order.walkInCustomerId!));
  assert.equal(c.visits, 0, "visit is counted on payment, not at checkout");
});

test("client-supplied pages are ignored when the server counted them", async () => {
  const t = await shop(); const f = await file(t.id, "x.pdf", 3);
  const o = await createWalkInOrder(t, input([{ fileId: f.id, copies: 1, color: "bw", sides: "single", paperSize: "A4", pages: 999 }]));
  assert.ok(o.rightsDeclaredAt && o.rightsDeclarationVersion, "declaration stored on the walk-in order");
  const [item] = await db.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, o.id));
  assert.equal(item.pages, 3);
});

test("rejections: plan/switch off, bad phone, foreign/used/confidential/bad-type files, too many files, bad option, no document product", async () => {
  const ok = await shop(), starter = await shop({ plan: NOFLAG }), off = await shop({ walkIn: false });
  const line = (id: string) => ({ fileId: id, copies: 1, color: "bw" as const, sides: "single" as const, paperSize: "A4" });
  const sf = await file(starter.id, "a.pdf", 1), of = await file(off.id, "a.pdf", 1);
  await assert.rejects(() => createWalkInOrder(starter, input([line(sf.id)])), (e: Error) => e instanceof CheckoutError && (e as CheckoutError).status === 403);
  await assert.rejects(() => createWalkInOrder(off, input([line(of.id)])), (e: Error) => e instanceof CheckoutError && (e as CheckoutError).status === 403);
  const f = await file(ok.id, "a.pdf", 1);
  await rejects(createWalkInOrder(ok, input([line(f.id)], { phone: "12" })), /valid mobile/);
  await assert.rejects(() => createWalkInOrder(ok, input([line(f.id)], { rightsDeclared: false })), (e: Error) => e instanceof CheckoutError && (e as CheckoutError).status === 400 && /right to print/.test(e.message));
  const other = await shop(); const foreign = await file(other.id, "a.pdf", 1);
  await rejects(createWalkInOrder(ok, input([line(foreign.id)])), /no longer available/);
  await rejects(createWalkInOrder(ok, input([line((await file(ok.id, "art.ai", null)).id)])), /can't be printed/);
  await rejects(createWalkInOrder(ok, input([line((await file(ok.id, "secret.pdf", 2, { confidential: true })).id)])), /can't be printed/);
  await rejects(createWalkInOrder(ok, input([line((await file(ok.id, "nopages.docx", null)).id)])), /number of pages/);
  await rejects(createWalkInOrder(ok, input([{ ...line(f.id), paperSize: "B9" }])), /isn't available/);
  await rejects(createWalkInOrder(ok, input([line(f.id), line(f.id)])), /twice/);
  const small = await shop({ walkIn: { enabled: true, maxFilesPerVisit: 2 } });
  const three = await Promise.all([1, 2, 3].map((i) => file(small.id, `f${i}.pdf`, 1)));
  await rejects(createWalkInOrder(small, input(three.map((x) => line(x.id)))), /up to 2 files/);
  // after the order uses a file, it can't be reused
  await createWalkInOrder(ok, input([line(f.id)]));
  await rejects(createWalkInOrder(ok, input([line(f.id)])), /no longer available/);
  // no active document product => not set up
  await db.update(schema.products).set({ active: false }).where(and(eq(schema.products.tenantId, ok.id), eq(schema.products.kind, "document")));
  await rejects(createWalkInOrder(ok, input([line((await file(ok.id, "z.pdf", 1)).id)])), /isn't set up/);
});

test("same phone reuses one customer; tickets count up; payment enqueues once and counts one visit", async () => {
  const t = await shop();
  const mk = async (name: string) => {
    const f = await file(t.id, "a.pdf", 1);
    return createWalkInOrder(t, input([{ fileId: f.id, copies: 1, color: "bw", sides: "single", paperSize: "A4" }], { name }));
  };
  const o1 = await mk("Aisha"), o2 = await mk("Aisha K");
  assert.equal(o1.walkInCustomerId, o2.walkInCustomerId);
  assert.deepEqual([o1.ticketNo, o2.ticketNo], ["W-001", "W-002"]);
  assert.equal((await db.select().from(schema.walkInCustomers).where(eq(schema.walkInCustomers.tenantId, t.id))).length, 1);

  assert.equal(await markOrderPaid(o1.id, "stripe", "ref1"), true);
  assert.equal(await markOrderPaid(o1.id, "stripe", "ref1"), false, "idempotent");
  const jobs = await db.select().from(schema.printJobs).where(eq(schema.printJobs.orderId, o1.id));
  assert.deepEqual(jobs.map((j) => j.status), ["queued"]);
  assert.equal(jobs[0].priority, 1, "1-page job gets the small-job boost");
  let [c] = await db.select().from(schema.walkInCustomers).where(eq(schema.walkInCustomers.id, o1.walkInCustomerId!));
  assert.equal(c.visits, 1); assert.equal(c.totalSpent, o1.total);
  assert.equal(c.name, "Aisha K", "latest name wins");
  await markOrderPaid(o2.id, "stripe", "ref2");
  [c] = await db.select().from(schema.walkInCustomers).where(eq(schema.walkInCustomers.id, o1.walkInCustomerId!));
  assert.equal(c.visits, 2);
});
