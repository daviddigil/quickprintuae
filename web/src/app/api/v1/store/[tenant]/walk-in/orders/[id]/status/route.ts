import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { rateLimit } from "@/lib/rate-limit";
import { resolveTenant } from "@/lib/tenant";
import { verifyPayment } from "@/server/payments";
import { verifyOrderToken } from "@/server/checkout";
import { orderQueueSummary } from "@/server/walk-in/queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Polled by the customer's status page. Authorised by the order's HMAC token only; exposes no personal data. */
export async function GET(req: Request, { params }: { params: Promise<{ tenant: string; id: string }> }) {
  const p = await params;
  const tenant = await resolveTenant(p.tenant);
  if (!tenant || !z.string().uuid().safeParse(p.id).success) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const t = new URL(req.url).searchParams.get("t");
  let order = await db.query.orders.findFirst({ where: and(eq(schema.orders.id, p.id), eq(schema.orders.tenantId, tenant.id), eq(schema.orders.source, "walk_in")) });
  if (!order || !verifyOrderToken(order.id, t)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // a paid return can race the provider webhook: check with the provider, but at most every 8s per order
  if (order.status === "pending_payment" && rateLimit(`wi-verify:${order.id}`, 1, 8_000).ok) {
    try { if (await verifyPayment(tenant, order)) order = (await db.query.orders.findFirst({ where: eq(schema.orders.id, order.id) }))!; }
    catch (e) { console.error("walk-in verifyPayment failed", e); }
  }
  const summary = await orderQueueSummary(tenant.id, order.id);
  return NextResponse.json({
    orderStatus: order.status, paid: order.status !== "pending_payment" && order.status !== "cancelled",
    state: order.status === "cancelled" || order.status === "refunded" ? "cancelled" : summary.state,
    ticketNo: summary.ticketNo ?? order.ticketNo, total: order.total, jobs: summary.jobs,
  }, { headers: { "cache-control": "no-store" } });
}
