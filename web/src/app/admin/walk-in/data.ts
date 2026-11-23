import "server-only";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import QRCode from "qrcode";
import { db, schema } from "@/db";
import type { Tenant } from "@/db/schema";
import { env } from "@/lib/env";
import { agentOnline } from "@/server/walk-in/agents";
import { groupQueue, type QueueRow } from "./group";

/** The URL walk-in customers land on (what the QR encodes). */
export const walkInUrl = (t: Pick<Tenant, "slug" | "customDomain">) => (t.customDomain ? `https://${t.customDomain}/walk-in` : `${env.appUrl}/s/${t.slug}/walk-in`);
export const walkInQrSvg = (url: string, width = 240) => QRCode.toString(url, { type: "svg", margin: 1, width, errorCorrectionLevel: "M" });

const DAY = (col: unknown) => sql`(date_trunc('day', ${col} at time zone 'Asia/Dubai')) = date_trunc('day', now() at time zone 'Asia/Dubai')`;

const sel = {
  id: schema.printJobs.id, orderId: schema.printJobs.orderId, orderNumber: schema.orders.number, ticketNo: schema.printJobs.ticketNo,
  status: schema.printJobs.status, priority: schema.printJobs.priority, filename: schema.printJobs.filename, fileId: schema.printJobs.fileId,
  pages: schema.printJobs.pages, copies: schema.printJobs.copies, pagesVerified: schema.printJobs.pagesVerified, options: schema.printJobs.options,
  printerName: schema.printJobs.printerName, attempts: schema.printJobs.attempts, error: schema.printJobs.error,
  queuedAt: schema.printJobs.queuedAt, startedAt: schema.printJobs.startedAt, finishedAt: schema.printJobs.finishedAt, createdAt: schema.printJobs.createdAt,
  customerName: schema.orders.customerName, customerPhone: schema.orders.customerPhone, paidAt: schema.orders.paidAt,
};
const iso = (d: Date | null) => (d ? d.toISOString() : null);

/** Whole /admin/walk-in dashboard payload: 3 queries (active jobs, recent printed, stats) + agents. Tenant-scoped. */
export async function loadWalkInQueue(tenantId: string) {
  const base = db.select(sel).from(schema.printJobs).innerJoin(schema.orders, eq(schema.orders.id, schema.printJobs.orderId));
  const [active, printed, [stats], agents] = await Promise.all([
    base.where(and(eq(schema.printJobs.tenantId, tenantId), inArray(schema.printJobs.status, ["awaiting_payment", "queued", "printing", "failed", "needs_manual"]))),
    db.select(sel).from(schema.printJobs).innerJoin(schema.orders, eq(schema.orders.id, schema.printJobs.orderId))
      .where(and(eq(schema.printJobs.tenantId, tenantId), eq(schema.printJobs.status, "printed"))).orderBy(desc(schema.printJobs.finishedAt)).limit(20),
    db.select({
      waiting: sql<number>`count(*) filter (where ${schema.printJobs.status} = 'queued')::int`,
      printing: sql<number>`count(*) filter (where ${schema.printJobs.status} = 'printing')::int`,
      printedToday: sql<number>`count(*) filter (where ${schema.printJobs.status} = 'printed' and ${DAY(schema.printJobs.finishedAt)})::int`,
      attention: sql<number>`count(*) filter (where ${schema.printJobs.status} in ('failed','needs_manual'))::int`,
    }).from(schema.printJobs).where(eq(schema.printJobs.tenantId, tenantId)),
    db.query.printAgents.findMany({ where: eq(schema.printAgents.tenantId, tenantId), orderBy: [desc(schema.printAgents.createdAt)] }),
  ]);
  const [rev] = await db.select({ revenue: sql<number>`coalesce(sum(${schema.orders.total}),0)::float`, orders: sql<number>`count(*)::int` }).from(schema.orders)
    .where(and(eq(schema.orders.tenantId, tenantId), eq(schema.orders.source, "walk_in"), sql`${schema.orders.paidAt} is not null`, sql`${schema.orders.status} not in ('cancelled','refunded')`, DAY(schema.orders.paidAt)));
  const rows: QueueRow[] = [...active, ...printed].map(({ paidAt, ...r }) => ({
    ...r, paid: !!paidAt, queuedAt: iso(r.queuedAt), startedAt: iso(r.startedAt), finishedAt: iso(r.finishedAt), createdAt: r.createdAt.toISOString(),
  }));
  return {
    stats: { ...stats, revenueToday: rev.revenue, ordersToday: rev.orders },
    sections: groupQueue(rows),
    agents: agents.map((a) => ({ id: a.id, name: a.name, prefix: a.apiKeyPrefix, active: a.active, online: a.active && agentOnline(a), lastSeenAt: iso(a.lastSeenAt), printers: a.printers })),
    serverTime: new Date().toISOString(),
  };
}
export type WalkInQueueData = Awaited<ReturnType<typeof loadWalkInQueue>>;

/** Tiny counts for the dashboard card. */
export async function walkInCounts(tenantId: string) {
  const [r] = await db.select({
    waiting: sql<number>`count(*) filter (where ${schema.printJobs.status} = 'queued')::int`,
    printing: sql<number>`count(*) filter (where ${schema.printJobs.status} = 'printing')::int`,
    printedToday: sql<number>`count(*) filter (where ${schema.printJobs.status} = 'printed' and ${DAY(schema.printJobs.finishedAt)})::int`,
  }).from(schema.printJobs).where(eq(schema.printJobs.tenantId, tenantId));
  return r;
}
