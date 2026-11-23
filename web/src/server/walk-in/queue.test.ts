/** DB-backed tests. Run: npx tsx --conditions react-server --tsconfig tsconfig.json --test src/server/walk-in/queue.test.ts */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { provisionTenant } from "@/server/provision";
import { createDb } from "@/db/client";
import { createAgent, authenticateAgent } from "./agents";
import { assertFeature, FeatureLockedError } from "@/server/billing";
import { enqueueOrderJobs, claimNext, completeJob, bumpJob, cancelJob, sweepStale, queuePosition, createPrintJobs, MAX_ATTEMPTS } from "./queue";

const suffix = Date.now().toString(36);
const created: string[] = [];
const OPTS = { color: "bw", sides: "single", paperSize: "A4" } as const;

async function tenant(plan = "growth") {
  const { tenant: t } = await provisionTenant(createDb().db, { shopName: `Q ${suffix}`, slug: `q${suffix}${created.length}`, ownerName: "O", ownerEmail: `o${created.length}${suffix}@t.ae`, ownerPassword: "pw123456", planCode: plan });
  created.push(t.id);
  return t;
}

/** one walk-in order with N single-file jobs of the given page counts (not yet paid) */
async function walkInOrder(tenantId: string, pages: number[], phone = "+971500000001") {
  const [cust] = await db.insert(schema.walkInCustomers).values({ tenantId, phone, name: "Walker" }).onConflictDoUpdate({ target: [schema.walkInCustomers.tenantId, schema.walkInCustomers.phone], set: { name: "Walker" } }).returning();
  const [order] = await db.insert(schema.orders).values({
    tenantId, number: `T-${Math.random().toString(36).slice(2, 8)}`, customerName: "Walker", customerEmail: "walkin@invalid", customerPhone: phone,
    fulfillment: "pickup", subtotal: 10, vat: 0.5, total: 10.5, status: "paid", source: "walk_in", walkInCustomerId: cust.id, ticketNo: "W-001",
  }).returning();
  const files = await db.insert(schema.files).values(pages.map((p, i) => ({ tenantId, filename: `f${i}.pdf`, storageKey: `x/${i}`, mime: "application/pdf", size: 1, pageCount: p, orderId: order.id }))).returning();
  await db.transaction((tx) => createPrintJobs(tx, tenantId, order.id, "W-001", files.map((f, i) => ({ fileId: f.id, filename: f.filename, copies: 1, pages: pages[i], pagesVerified: true, options: OPTS }))));
  return { order, cust };
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

after(async () => { for (const id of created) await db.delete(schema.tenants).where(eq(schema.tenants.id, id)); });

test("paid order enqueues once; small jobs are boosted; visits counted once", async () => {
  const t = await tenant();
  const { order, cust } = await walkInOrder(t.id, [300, 2]);
  assert.equal(await enqueueOrderJobs(order.id), 2);
  assert.equal(await enqueueOrderJobs(order.id), 0, "second call is a no-op");
  const jobs = await db.select().from(schema.printJobs).where(eq(schema.printJobs.orderId, order.id));
  assert.deepEqual(jobs.map((j) => [j.pages, j.priority]).sort((a, b) => a[0] - b[0]), [[2, 1], [300, 0]]);
  const [c] = await db.select().from(schema.walkInCustomers).where(eq(schema.walkInCustomers.id, cust.id));
  assert.equal(c.visits, 1);
  assert.equal(c.totalSpent, 10.5);
});

test("claim order: priority desc then FIFO; bump goes first", async () => {
  const t = await tenant(); const { agent } = await createAgent(t.id, "a");
  const a = await walkInOrder(t.id, [50]); await enqueueOrderJobs(a.order.id); await sleep(15);
  const b = await walkInOrder(t.id, [60], "+971500000002"); await enqueueOrderJobs(b.order.id); await sleep(15);
  const c = await walkInOrder(t.id, [1], "+971500000003"); await enqueueOrderJobs(c.order.id); // small => priority 1
  const bJob = (await db.select().from(schema.printJobs).where(eq(schema.printJobs.orderId, b.order.id)))[0];
  assert.deepEqual((await queuePosition(t.id, bJob.id)).ahead, 2); // small job + earlier job
  await bumpJob(t.id, bJob.id);
  const order: number[] = [];
  for (let i = 0; i < 3; i++) order.push((await claimNext(t.id, agent.id))!.pages);
  assert.deepEqual(order, [60, 1, 50]); // bumped(2), small(1), then FIFO normal
  assert.equal(await claimNext(t.id, agent.id), null);
});

test("concurrent claims never hand out the same job", async () => {
  const t = await tenant(); const { agent } = await createAgent(t.id, "a");
  for (let i = 0; i < 6; i++) { const w = await walkInOrder(t.id, [20 + i], `+97150000010${i}`); await enqueueOrderJobs(w.order.id); }
  const got = await Promise.all(Array.from({ length: 10 }, () => claimNext(t.id, agent.id)));
  const ids = got.filter(Boolean).map((j) => j!.id);
  assert.equal(ids.length, 6);
  assert.equal(new Set(ids).size, 6);
});

test("print flow: printed -> order ready; failures retry then need manual; stale claims recover", async () => {
  const t = await tenant(); const { agent } = await createAgent(t.id, "a");
  const w = await walkInOrder(t.id, [10]); await enqueueOrderJobs(w.order.id);
  let job = (await claimNext(t.id, agent.id, "HP"))!;
  assert.equal((await db.query.orders.findFirst({ where: eq(schema.orders.id, w.order.id) }))!.status, "in_production");
  for (let i = 1; i < MAX_ATTEMPTS; i++) {
    const r = await completeJob(t.id, job.id, agent.id, { status: "failed", error: "paper jam" });
    assert.equal(r!.status, "queued"); job = (await claimNext(t.id, agent.id))!;
  }
  assert.equal((await completeJob(t.id, job.id, agent.id, { status: "failed", error: "paper jam" }))!.status, "needs_manual");
  // stale: reprint, claim, then age the claim
  const { reprintJob } = await import("./queue");
  await reprintJob(t.id, job.id); job = (await claimNext(t.id, agent.id))!;
  await db.execute(await import("drizzle-orm").then(({ sql }) => sql`update print_jobs set claimed_at = now() - interval '10 minutes' where id = ${job.id}`));
  await sweepStale(t.id);
  assert.equal((await db.query.printJobs.findFirst({ where: eq(schema.printJobs.id, job.id) }))!.status, "queued");
  job = (await claimNext(t.id, agent.id))!;
  const done = await completeJob(t.id, job.id, agent.id, { status: "printed" });
  assert.equal(done!.status, "printed");
  assert.equal((await db.query.orders.findFirst({ where: eq(schema.orders.id, w.order.id) }))!.status, "ready");
  assert.ok((await db.query.files.findFirst({ where: eq(schema.files.id, job.fileId) }))!.deleteAfter, "retention timer set");
});

test("tenant isolation + agent auth", async () => {
  const t1 = await tenant(), t2 = await tenant();
  const a1 = await createAgent(t1.id, "a1"), a2 = await createAgent(t2.id, "a2");
  const w = await walkInOrder(t1.id, [5]); await enqueueOrderJobs(w.order.id);
  assert.equal(await claimNext(t2.id, a2.agent.id), null, "other shop's agent sees nothing");
  const job = (await claimNext(t1.id, a1.agent.id))!;
  assert.equal(await completeJob(t2.id, job.id, a2.agent.id, { status: "printed" }), null);
  assert.equal(await completeJob(t1.id, job.id, a2.agent.id, { status: "printed" }), null, "only the claiming agent can complete");
  assert.equal(await cancelJob(t2.id, job.id), null);
  const req = (k: string) => new Request("http://x", { headers: { authorization: `Bearer ${k}` } });
  assert.equal((await authenticateAgent(req(a1.key)))?.id, a1.agent.id);
  assert.equal(await authenticateAgent(req(a1.key + "x")), null);
  assert.equal(await authenticateAgent(req("qpa_" + "a".repeat(32))), null);
  assert.notEqual(a1.agent.apiKeyHash, a1.key, "key is stored hashed");
});

test("plan flag gates the feature", async () => {
  const starter = await tenant("starter"), growth = await tenant("growth");
  await assert.rejects(() => assertFeature(starter, "walk_in_queue"), FeatureLockedError);
  await assertFeature(growth, "walk_in_queue");
});
