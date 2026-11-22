import Link from "next/link";
import { and, desc, eq, gte, ilike, lt, or, sql, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireStaff } from "@/lib/auth";
import { formatAED } from "@/lib/pricing";
import { ORDER_STATUSES, ORDER_STATUS_LABEL, type OrderStatus } from "@/lib/types";
import { Badge, Button, Card, EmptyState, Input, LinkButton, ORDER_STATUS_TONE, Select, Table } from "@/components/ui";
import { PageHeader } from "@/components/admin/PageHeader";
import { dubai, slotLabel } from "@/components/admin/format";

export const metadata = { title: "Orders" };
const PAGE = 50;

export default async function OrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { tenant } = await requireStaff();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const where: SQL[] = [eq(schema.orders.tenantId, tenant.id)];
  if (sp.status && (ORDER_STATUSES as readonly string[]).includes(sp.status)) where.push(eq(schema.orders.status, sp.status as OrderStatus));
  if (sp.fulfillment === "pickup" || sp.fulfillment === "delivery") where.push(eq(schema.orders.fulfillment, sp.fulfillment));
  if (sp.from) where.push(gte(schema.orders.createdAt, new Date(`${sp.from}T00:00:00+04:00`)));
  if (sp.to) where.push(lt(schema.orders.createdAt, new Date(new Date(`${sp.to}T00:00:00+04:00`).getTime() + 86400_000)));
  if (sp.q?.trim()) {
    const q = `%${sp.q.trim()}%`;
    where.push(or(ilike(schema.orders.number, q), ilike(schema.orders.customerName, q), ilike(schema.orders.customerPhone, q), ilike(schema.orders.customerEmail, q))!);
  }
  const rows = await db.query.orders.findMany({ where: and(...where), orderBy: [desc(schema.orders.createdAt)], limit: PAGE + 1, offset: (page - 1) * PAGE });
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.orders).where(and(...where));
  const qs = (p: number) => "?" + new URLSearchParams({ ...Object.fromEntries(Object.entries(sp).filter(([, v]) => v)) as Record<string, string>, page: String(p) }).toString();

  return (
    <div>
      <PageHeader title="Orders" subtitle={`${n} order${n === 1 ? "" : "s"}`} />
      <Card className="mb-4 p-4">
        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <Input name="q" placeholder="Order #, name, phone, email" defaultValue={sp.q} className="lg:col-span-2" />
          <Select name="status" defaultValue={sp.status ?? ""}>
            <option value="">All statuses</option>
            {ORDER_STATUSES.map((s) => <option key={s} value={s}>{ORDER_STATUS_LABEL[s]}</option>)}
          </Select>
          <Select name="fulfillment" defaultValue={sp.fulfillment ?? ""}>
            <option value="">Pickup & delivery</option><option value="pickup">Pickup</option><option value="delivery">Delivery</option>
          </Select>
          <Input type="date" name="from" defaultValue={sp.from} aria-label="From" />
          <div className="flex gap-2">
            <Input type="date" name="to" defaultValue={sp.to} aria-label="To" />
            <Button>Filter</Button>
          </div>
        </form>
      </Card>
      <Card>
        {rows.length === 0 ? <EmptyState title="No orders match your filters" /> : (
          <Table head={["Order", "Date", "Customer", "Fulfillment", "Slot", "Total", "Status"]}>
            {rows.slice(0, PAGE).map((o) => (
              <tr key={o.id} className="hover:bg-slate-50">
                <td className="px-4 py-3"><Link className="font-semibold text-brand-600" href={`/admin/orders/${o.id}`}>{o.number}</Link></td>
                <td className="px-4 py-3 text-xs text-slate-500">{dubai(o.createdAt)}</td>
                <td className="px-4 py-3"><div>{o.customerName}</div><div className="text-xs text-slate-500">{o.customerPhone}</div></td>
                <td className="px-4 py-3"><Badge tone={o.fulfillment === "delivery" ? "blue" : "gray"}>{o.fulfillment}</Badge></td>
                <td className="px-4 py-3 text-xs">{o.slotStart ? slotLabel(o.slotStart, o.slotEnd) : "—"}</td>
                <td className="px-4 py-3 font-medium">{formatAED(o.total)}</td>
                <td className="px-4 py-3"><Badge tone={ORDER_STATUS_TONE[o.status]}>{ORDER_STATUS_LABEL[o.status]}</Badge></td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      <div className="mt-4 flex justify-between">
        {page > 1 ? <LinkButton variant="secondary" href={qs(page - 1)}>← Previous</LinkButton> : <span />}
        {rows.length > PAGE && <LinkButton variant="secondary" href={qs(page + 1)}>Next →</LinkButton>}
      </div>
    </div>
  );
}
