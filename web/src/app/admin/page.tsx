import Link from "next/link";
import { and, asc, eq, gte, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireStaff } from "@/lib/auth";
import { formatAED } from "@/lib/pricing";
import { ORDER_STATUS_LABEL, type OrderStatus } from "@/lib/types";
import { Badge, Card, CardHeader, EmptyState, ORDER_STATUS_TONE, Stat, Table } from "@/components/ui";
import { PageHeader } from "@/components/admin/PageHeader";
import { dubai, slotLabel } from "@/components/admin/format";

export const metadata = { title: "Dashboard" };

const PAID = sql`${schema.orders.paidAt} is not null and ${schema.orders.status} not in ('cancelled','refunded')`;
const LOCAL_DAY = sql`(date_trunc('day', ${schema.orders.createdAt} at time zone 'Asia/Dubai'))`;

export default async function Dashboard() {
  const { tenant } = await requireStaff();
  const t = eq(schema.orders.tenantId, tenant.id);
  const since14 = new Date(Date.now() - 14 * 86400_000);

  const [agg] = await db.select({
    todayOrders: sql<number>`count(*) filter (where ${LOCAL_DAY} = date_trunc('day', now() at time zone 'Asia/Dubai'))::int`,
    todayRevenue: sql<number>`coalesce(sum(${schema.orders.total}) filter (where ${PAID} and ${LOCAL_DAY} = date_trunc('day', now() at time zone 'Asia/Dubai')),0)::float`,
    weekOrders: sql<number>`count(*) filter (where ${schema.orders.createdAt} > now() - interval '7 days')::int`,
    weekRevenue: sql<number>`coalesce(sum(${schema.orders.total}) filter (where ${PAID} and ${schema.orders.createdAt} > now() - interval '7 days'),0)::float`,
    awaiting: sql<number>`count(*) filter (where ${schema.orders.status} = 'pending_payment')::int`,
  }).from(schema.orders).where(t);

  const byStatus = await db.select({ status: schema.orders.status, n: sql<number>`count(*)::int` })
    .from(schema.orders).where(t).groupBy(schema.orders.status);

  const daily = await db.select({ day: sql<string>`to_char(${LOCAL_DAY}, 'YYYY-MM-DD')`, revenue: sql<number>`coalesce(sum(${schema.orders.total}) filter (where ${PAID}),0)::float` })
    .from(schema.orders).where(and(t, gte(schema.orders.createdAt, since14))).groupBy(LOCAL_DAY);

  const queue = await db.query.orders.findMany({
    where: and(t, inArray(schema.orders.status, ["paid", "in_production"])),
    orderBy: [asc(sql`coalesce(${schema.orders.slotStart}, ${schema.orders.paidAt} + interval '24 hours')`)], limit: 10,
  });
  const upcoming = await db.query.orders.findMany({
    where: and(t, inArray(schema.orders.status, ["paid", "in_production", "ready", "out_for_delivery"]), sql`${schema.orders.slotStart} is not null`, gte(schema.orders.slotStart, new Date(Date.now() - 3 * 3600_000))),
    orderBy: [asc(schema.orders.slotStart)], limit: 10,
  });

  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(Date.now() + 4 * 3600_000 - (13 - i) * 86400_000).toISOString().slice(0, 10);
    return { day: d, revenue: daily.find((x) => x.day === d)?.revenue ?? 0 };
  });
  const max = Math.max(1, ...days.map((d) => d.revenue));

  return (
    <div className="space-y-6">
      <PageHeader title={`Welcome back`} subtitle={`Here's what's happening at ${tenant.name} today.`} />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Orders today" value={agg.todayOrders} />
        <Stat label="Revenue today" value={formatAED(agg.todayRevenue)} sub="paid orders, incl. VAT" />
        <Stat label="Orders (7 days)" value={agg.weekOrders} />
        <Stat label="Revenue (7 days)" value={formatAED(agg.weekRevenue)} sub={`${agg.awaiting} awaiting payment`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Revenue — last 14 days" />
          <div className="flex h-52 items-end gap-1.5 px-5 pb-2 pt-6">
            {days.map((d) => (
              <div key={d.day} className="group relative flex h-full flex-1 flex-col justify-end">
                <div className="rounded-t bg-slate-900/80 transition group-hover:bg-brand-600" style={{ height: `${Math.max(2, (d.revenue / max) * 100)}%` }} />
                <span className="pointer-events-none absolute -top-5 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-slate-900 px-1.5 py-0.5 text-[10px] text-white group-hover:block">{formatAED(d.revenue)}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-1.5 px-5 pb-4 text-[10px] text-slate-400">
            {days.map((d, i) => <span key={d.day} className="flex-1 text-center">{i % 2 === 0 ? d.day.slice(8) : ""}</span>)}
          </div>
        </Card>
        <Card>
          <CardHeader title="Orders by status" />
          <ul className="divide-y text-sm">
            {byStatus.length === 0 && <EmptyState title="No orders yet" />}
            {byStatus.map((s) => (
              <li key={s.status} className="flex items-center justify-between px-5 py-2.5">
                <Link href={`/admin/orders?status=${s.status}`}><Badge tone={ORDER_STATUS_TONE[s.status]}>{ORDER_STATUS_LABEL[s.status as OrderStatus]}</Badge></Link>
                <span className="font-semibold">{s.n}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Production queue" subtitle="Paid and printing, by due time" action={<Link className="text-sm font-medium text-brand-600" href="/admin/orders?status=paid">All</Link>} />
          {queue.length === 0 ? <EmptyState title="Queue is clear" /> : (
            <Table head={["Order", "Customer", "Due", "Status"]}>
              {queue.map((o) => (
                <tr key={o.id}>
                  <td className="px-4 py-2.5"><Link className="font-medium text-brand-600" href={`/admin/orders/${o.id}`}>{o.number}</Link></td>
                  <td className="px-4 py-2.5">{o.customerName}</td>
                  <td className="px-4 py-2.5 text-xs">{o.slotStart ? slotLabel(o.slotStart, o.slotEnd) : dubai(o.paidAt ? new Date(o.paidAt.getTime() + 86400_000) : null)}</td>
                  <td className="px-4 py-2.5"><Badge tone={ORDER_STATUS_TONE[o.status]}>{ORDER_STATUS_LABEL[o.status]}</Badge></td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
        <Card>
          <CardHeader title="Upcoming deliveries & pickups" subtitle="Scheduled slots" />
          {upcoming.length === 0 ? <EmptyState title="Nothing scheduled" /> : (
            <Table head={["Slot", "Order", "Type", "Where"]}>
              {upcoming.map((o) => (
                <tr key={o.id}>
                  <td className="px-4 py-2.5 text-xs">{slotLabel(o.slotStart, o.slotEnd)}</td>
                  <td className="px-4 py-2.5"><Link className="font-medium text-brand-600" href={`/admin/orders/${o.id}`}>{o.number}</Link></td>
                  <td className="px-4 py-2.5"><Badge tone={o.fulfillment === "delivery" ? "blue" : "gray"}>{o.fulfillment}</Badge></td>
                  <td className="px-4 py-2.5 text-xs">{o.deliveryAddress ? `${o.deliveryAddress.area}, ${o.deliveryAddress.emirate}` : "Pickup"}</td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>
    </div>
  );
}
