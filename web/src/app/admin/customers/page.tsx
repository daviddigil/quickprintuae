import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireStaff } from "@/lib/auth";
import { formatAED } from "@/lib/pricing";
import { Button, Card, EmptyState, Input, Table } from "@/components/ui";
import { Badge } from "@/components/ui";
import { PageHeader } from "@/components/admin/PageHeader";
import { dubai, waLink } from "@/components/admin/format";

export const metadata = { title: "Customers" };

/** Customers = registered accounts plus guest buyers, grouped by email from orders. */
export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { tenant } = await requireStaff();
  const { q } = await searchParams;
  const o = schema.orders;
  const filter = q?.trim() ? or(ilike(o.customerName, `%${q.trim()}%`), ilike(o.customerEmail, `%${q.trim()}%`), ilike(o.customerPhone, `%${q.trim()}%`)) : undefined;
  const rows = await db.select({
    email: sql<string>`lower(${o.customerEmail})`,
    name: sql<string>`max(${o.customerName})`,
    phone: sql<string>`max(${o.customerPhone})`,
    orders: sql<number>`count(*)::int`,
    spent: sql<number>`coalesce(sum(${o.total}) filter (where ${o.paidAt} is not null and ${o.status} not in ('cancelled','refunded')),0)::float`,
    last: sql<Date>`max(${o.createdAt})`,
    registered: sql<boolean>`bool_or(${o.customerId} is not null)`,
  }).from(o).where(and(eq(o.tenantId, tenant.id), filter)).groupBy(sql`lower(${o.customerEmail})`).orderBy(desc(sql`max(${o.createdAt})`)).limit(200);
  const wq = q?.trim() ? or(ilike(schema.walkInCustomers.name, `%${q.trim()}%`), ilike(schema.walkInCustomers.phone, `%${q.trim()}%`)) : undefined;
  const walkIns = await db.select().from(schema.walkInCustomers).where(and(eq(schema.walkInCustomers.tenantId, tenant.id), wq)).orderBy(desc(schema.walkInCustomers.lastSeenAt)).limit(200);
  const [{ accounts }] = await db.select({ accounts: sql<number>`count(*)::int` }).from(schema.users).where(and(eq(schema.users.tenantId, tenant.id), eq(schema.users.role, "customer")));

  return (
    <div>
      <PageHeader title="Customers" subtitle={`${accounts} registered accounts · ${rows.length} online buyers shown`} />
      <Card className="mb-4 p-4"><form className="flex gap-2"><Input name="q" defaultValue={q} placeholder="Search name, email or phone" /><Button>Search</Button></form></Card>
      <Card>
        {rows.length === 0 ? <EmptyState title="No customers yet" /> : (
          <Table head={["Customer", "Phone", "Orders", "Spent", "Last order", ""]}>
            {rows.map((r) => (
              <tr key={r.email}>
                <td className="px-4 py-3"><div className="font-medium">{r.name}</div><div className="text-xs text-slate-500">{r.email}{r.registered ? " · account" : " · guest"}</div></td>
                <td className="px-4 py-3">{r.phone}</td>
                <td className="px-4 py-3"><a className="text-brand-600" href={`/admin/orders?q=${encodeURIComponent(r.email)}`}>{r.orders}</a></td>
                <td className="px-4 py-3">{formatAED(r.spent)}</td>
                <td className="px-4 py-3 text-xs text-slate-500">{dubai(new Date(r.last))}</td>
                <td className="px-4 py-3 text-right"><a className="text-sm font-medium text-emerald-700" target="_blank" href={waLink(r.phone, `Hi ${r.name}, `)}>WhatsApp</a></td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      <h2 className="mb-2 mt-8 text-lg font-semibold">Walk-in customers <span className="text-sm font-normal text-slate-400">({walkIns.length})</span></h2>
      <Card data-testid="walkin-customers">
        {walkIns.length === 0 ? <EmptyState title="No walk-in customers yet">{" "}<span className="text-sm">They are saved by phone number the first time someone prints via your QR code.</span></EmptyState> : (
          <Table head={["Customer", "Phone", "Visits", "Spent", "Last visit", ""]}>
            {walkIns.map((w) => (
              <tr key={w.id}>
                <td className="px-4 py-3"><div className="font-medium">{w.name}</div><Badge tone="purple">Walk-in</Badge></td>
                <td className="px-4 py-3">{w.phone}</td>
                <td className="px-4 py-3"><a className="text-brand-600" href={`/admin/orders?source=walk_in&q=${encodeURIComponent(w.phone)}`}>{w.visits}</a></td>
                <td className="px-4 py-3">{formatAED(w.totalSpent)}</td>
                <td className="px-4 py-3 text-xs text-slate-500">{dubai(w.lastSeenAt)}</td>
                <td className="px-4 py-3 text-right"><a className="text-sm font-medium text-emerald-700" target="_blank" rel="noopener noreferrer" href={waLink(w.phone, `Hi ${w.name}, `)}>WhatsApp</a></td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
