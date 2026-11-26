import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireStorefrontTenant } from "@/lib/tenant";
import { enabledProviders, verifyPayment } from "@/server/payments";
import { verifyOrderToken } from "@/server/checkout";
import { orderQueueSummary } from "@/server/walk-in/queue";
import { WalkInStatus } from "@/components/store/walk-in/WalkInStatus";

export const metadata = { title: "Your print status", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function WalkInStatusPage({ params, searchParams }: { params: Promise<{ tenant: string; orderId: string }>; searchParams: Promise<{ t?: string }> }) {
  const { tenant: tp, orderId } = await params;
  const { t } = await searchParams;
  const tenant = await requireStorefrontTenant(tp);
  if (!z.string().uuid().safeParse(orderId).success) notFound();
  let order = await db.query.orders.findFirst({ where: and(eq(schema.orders.id, orderId), eq(schema.orders.tenantId, tenant.id), eq(schema.orders.source, "walk_in")) });
  if (!order || !verifyOrderToken(order.id, t)) notFound();
  if (order.status === "pending_payment") {
    try { if (await verifyPayment(tenant, order)) order = (await db.query.orders.findFirst({ where: eq(schema.orders.id, orderId) }))!; }
    catch (e) { console.error("walk-in verifyPayment failed", e); }
  }
  const summary = await orderQueueSummary(tenant.id, order.id);
  return (
    <WalkInStatus
      store={tenant.slug} orderId={order.id} token={t!} providers={await enabledProviders(tenant)} shopName={tenant.name}
      initial={{ state: order.status === "cancelled" || order.status === "refunded" ? "cancelled" : summary.state, ticketNo: summary.ticketNo ?? order.ticketNo, total: order.total, jobs: summary.jobs }}
    />
  );
}
