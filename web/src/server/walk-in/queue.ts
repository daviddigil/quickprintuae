import "server-only";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { PrintOptions } from "@/db/schema";
import { setOrderStatus } from "@/server/orders";
import { walkInSettings } from "./settings";

/** Queue rules: highest priority first, FIFO (by paid time) within a priority. */
export const QUEUE_ORDER = [desc(schema.printJobs.priority), asc(schema.printJobs.queuedAt)] as const;
export const MAX_ATTEMPTS = 3;
export const STALE_CLAIM_MINUTES = 5;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Per-shop daily ticket like "W-014" (Dubai day). Call inside the order transaction that holds the tenant advisory lock. */
export async function nextTicketNo(tx: Tx, tenantId: string) {
  const rows = await tx.execute(sql`
    select count(*)::int as n from orders
    where tenant_id = ${tenantId} and source = 'walk_in'
      and created_at >= date_trunc('day', now() at time zone 'Asia/Dubai') at time zone 'Asia/Dubai'`);
  const n = Number((rows as unknown as { n: number }[])[0]?.n ?? 0) + 1;
  return `W-${String(n).padStart(3, "0")}`;
}

export interface NewJob { orderItemId?: string; fileId: string; filename: string; copies: number; pages: number; pagesVerified: boolean; options: PrintOptions }

/** Jobs are created at checkout as awaiting_payment; they only become printable once the order is paid. */
export async function createPrintJobs(tx: Tx, tenantId: string, orderId: string, ticketNo: string, jobs: NewJob[]) {
  if (!jobs.length) return [];
  return tx.insert(schema.printJobs).values(jobs.map((j) => ({ ...j, tenantId, orderId, ticketNo, status: "awaiting_payment" as const }))).returning();
}

/**
 * Called from markOrderPaid for walk-in orders. Idempotent: only awaiting_payment jobs flip, and the customer's
 * visit/spend counters are bumped only when something actually flipped. Returns how many jobs were queued.
 */
export async function enqueueOrderJobs(orderId: string) {
  const order = await db.query.orders.findFirst({ where: eq(schema.orders.id, orderId) });
  if (!order || order.source !== "walk_in") return 0;
  const tenant = await db.query.tenants.findFirst({ where: eq(schema.tenants.id, order.tenantId) });
  const boost = tenant ? walkInSettings(tenant).smallJobBoostPages : 0;
  const queued = await db.update(schema.printJobs).set({
    status: "queued", queuedAt: new Date(),
    priority: sql`case when ${boost} > 0 and ${schema.printJobs.pages} <= ${boost} then 1 else 0 end`,
  }).where(and(eq(schema.printJobs.orderId, orderId), eq(schema.printJobs.status, "awaiting_payment"))).returning({ id: schema.printJobs.id });
  if (!queued.length) return 0;
  if (order.walkInCustomerId) {
    await db.update(schema.walkInCustomers).set({
      visits: sql`${schema.walkInCustomers.visits} + 1`, totalSpent: sql`${schema.walkInCustomers.totalSpent} + ${order.total}`, lastSeenAt: new Date(),
    }).where(eq(schema.walkInCustomers.id, order.walkInCustomerId));
  }
  await db.insert(schema.orderEvents).values({ orderId, status: "queued", message: `Added to print queue (${queued.length} file${queued.length > 1 ? "s" : ""}) — ticket ${order.ticketNo}` });
  return queued.length;
}

/** Claims that never finished (agent crashed / PC off) go back to the queue, or to manual after MAX_ATTEMPTS. */
export async function sweepStale(tenantId: string) {
  const cutoff = sql`now() - make_interval(mins => ${STALE_CLAIM_MINUTES})`;
  await db.update(schema.printJobs).set({ status: "needs_manual", error: "Printer agent stopped responding", claimedByAgentId: null })
    .where(and(eq(schema.printJobs.tenantId, tenantId), eq(schema.printJobs.status, "printing"), sql`${schema.printJobs.claimedAt} < ${cutoff}`, sql`${schema.printJobs.attempts} >= ${MAX_ATTEMPTS}`));
  await db.update(schema.printJobs).set({ status: "queued", claimedByAgentId: null, claimedAt: null })
    .where(and(eq(schema.printJobs.tenantId, tenantId), eq(schema.printJobs.status, "printing"), sql`${schema.printJobs.claimedAt} < ${cutoff}`));
}

/** Atomically hands the next job to an agent. Two agents can never receive the same job (SKIP LOCKED). */
export async function claimNext(tenantId: string, agentId: string, printerName?: string) {
  await sweepStale(tenantId);
  const rows = await db.execute(sql`
    update print_jobs j set status = 'printing', claimed_by_agent_id = ${agentId}, claimed_at = now(),
      started_at = coalesce(j.started_at, now()), attempts = j.attempts + 1, printer_name = ${printerName ?? null}, error = null
    where j.id = (
      select id from print_jobs where tenant_id = ${tenantId} and status = 'queued'
      order by priority desc, queued_at asc limit 1 for update skip locked)
    returning j.id`);
  const id = (rows as unknown as { id: string }[])[0]?.id;
  if (!id) return null;
  const job = await db.query.printJobs.findFirst({ where: eq(schema.printJobs.id, id) });
  if (job) await db.update(schema.orders).set({ status: "in_production", updatedAt: new Date() }).where(and(eq(schema.orders.id, job.orderId), eq(schema.orders.status, "paid")));
  return job ?? null;
}

async function finishOrderIfDone(orderId: string, tenantId: string) {
  const jobs = await db.select({ status: schema.printJobs.status }).from(schema.printJobs).where(eq(schema.printJobs.orderId, orderId));
  const live = jobs.filter((j) => j.status !== "cancelled");
  if (live.length && live.every((j) => j.status === "printed")) {
    const order = await db.query.orders.findFirst({ where: eq(schema.orders.id, orderId) });
    if (order && ["paid", "in_production"].includes(order.status)) await setOrderStatus(orderId, "ready", "All files printed — ready to collect");
    const t = await db.query.tenants.findFirst({ where: eq(schema.tenants.id, tenantId) });
    const hours = t ? walkInSettings(t).fileRetentionHours : 24;
    await db.update(schema.files).set({ deleteAfter: new Date(Date.now() + hours * 3600_000) })
      .where(inArray(schema.files.id, (await db.select({ id: schema.printJobs.fileId }).from(schema.printJobs).where(eq(schema.printJobs.orderId, orderId))).map((r) => r.id)));
  }
}

export type AgentResult = { status: "printed" | "failed" | "needs_manual"; error?: string };

/** Agent reports a result. Only the agent that holds the claim (same tenant) may complete a job. */
export async function completeJob(tenantId: string, jobId: string, agentId: string, r: AgentResult) {
  const job = await db.query.printJobs.findFirst({ where: and(eq(schema.printJobs.id, jobId), eq(schema.printJobs.tenantId, tenantId)) });
  if (!job || job.status !== "printing" || job.claimedByAgentId !== agentId) return null;
  const retry = r.status === "failed" && job.attempts < MAX_ATTEMPTS;
  const next = r.status === "failed" ? (retry ? "queued" : "needs_manual") : r.status;
  const [row] = await db.update(schema.printJobs).set({
    status: next, error: r.error ?? null, claimedByAgentId: retry ? null : job.claimedByAgentId, claimedAt: retry ? null : job.claimedAt,
    finishedAt: next === "queued" ? null : new Date(),
  }).where(eq(schema.printJobs.id, jobId)).returning();
  if (next === "printed") await finishOrderIfDone(job.orderId, tenantId);
  return row;
}

/* ---------- owner actions (tenant-scoped by the caller's session tenant) ---------- */
const own = (tenantId: string, jobId: string) => and(eq(schema.printJobs.id, jobId), eq(schema.printJobs.tenantId, tenantId));

export async function bumpJob(tenantId: string, jobId: string) {
  const [r] = await db.update(schema.printJobs).set({ priority: 2 }).where(and(own(tenantId, jobId), eq(schema.printJobs.status, "queued"))).returning();
  return r ?? null;
}
export async function cancelJob(tenantId: string, jobId: string) {
  const [r] = await db.update(schema.printJobs).set({ status: "cancelled", finishedAt: new Date() })
    .where(and(own(tenantId, jobId), inArray(schema.printJobs.status, ["queued", "awaiting_payment", "needs_manual", "failed"]))).returning();
  if (r) await finishOrderIfDone(r.orderId, tenantId);
  return r ?? null;
}
export async function reprintJob(tenantId: string, jobId: string) {
  const [r] = await db.update(schema.printJobs).set({ status: "queued", priority: 1, queuedAt: new Date(), attempts: 0, error: null, finishedAt: null, claimedByAgentId: null, claimedAt: null })
    .where(and(own(tenantId, jobId), inArray(schema.printJobs.status, ["printed", "failed", "needs_manual"]))).returning();
  return r ?? null;
}
export async function markPrintedManually(tenantId: string, jobId: string) {
  const [r] = await db.update(schema.printJobs).set({ status: "printed", finishedAt: new Date(), error: null })
    .where(and(own(tenantId, jobId), inArray(schema.printJobs.status, ["queued", "needs_manual", "failed", "printing"]))).returning();
  if (r) await finishOrderIfDone(r.orderId, tenantId);
  return r ?? null;
}

/** How many jobs are ahead of this one (printing + higher priority + earlier in the same priority). */
export async function queuePosition(tenantId: string, jobId: string) {
  const job = await db.query.printJobs.findFirst({ where: own(tenantId, jobId) });
  if (!job || job.status !== "queued" || !job.queuedAt) return { ahead: 0, state: job?.status ?? null };
  const rows = await db.execute(sql`
    select count(*)::int as n from print_jobs where tenant_id = ${tenantId} and id <> ${jobId} and (
      status = 'printing' or (status = 'queued' and (priority > ${job.priority} or (priority = ${job.priority} and queued_at < ${job.queuedAt.toISOString()}::timestamptz))))`);
  return { ahead: Number((rows as unknown as { n: number }[])[0]?.n ?? 0), state: "queued" as const };
}

/** Customer-facing summary for one order (status page polling). */
export async function orderQueueSummary(tenantId: string, orderId: string) {
  const jobs = await db.query.printJobs.findMany({ where: and(eq(schema.printJobs.tenantId, tenantId), eq(schema.printJobs.orderId, orderId)), orderBy: [asc(schema.printJobs.createdAt)] });
  const withPos = await Promise.all(jobs.map(async (j) => ({ id: j.id, filename: j.filename, status: j.status, pages: j.pages, copies: j.copies, error: j.error, ahead: j.status === "queued" ? (await queuePosition(tenantId, j.id)).ahead : null })));
  const live = jobs.filter((j) => j.status !== "cancelled");
  const state = !live.length ? "cancelled" : live.every((j) => j.status === "printed") ? "ready"
    : live.some((j) => j.status === "needs_manual" || j.status === "failed") ? "needs_attention"
    : live.some((j) => j.status === "printing") ? "printing" : live.some((j) => j.status === "queued") ? "waiting" : "awaiting_payment";
  return { state, ticketNo: jobs[0]?.ticketNo ?? null, jobs: withPos };
}
