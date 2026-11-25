import Link from "next/link";
import { inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireSuperadmin } from "@/lib/auth";
import { Badge, Card, CardHeader, EmptyState, Stat, Table } from "@/components/ui";
import { PageTitle } from "@/components/platform/PageTitle";
import { formatAED } from "@/lib/pricing";
import { describeRule, resolveRule } from "@/lib/commission";
import { commissionSummary } from "@/server/commission";

export const metadata = { title: "Commissions" };
export const dynamic = "force-dynamic";

function monthBounds(m: string) {
  const [y, mo] = m.split("-").map(Number);
  return { start: new Date(Date.UTC(y, mo - 1, 1)), end: new Date(Date.UTC(y, mo, 1)) };
}
const lastMonths = (n: number) => Array.from({ length: n }, (_, i) => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - i); return d.toISOString().slice(0, 7); });

export default async function CommissionsPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  await requireSuperadmin();
  const months = lastMonths(12);
  const m = (await searchParams).m && months.includes((await searchParams).m!) ? (await searchParams).m! : months[0];
  const { start, end } = monthBounds(m);
  const rows = await commissionSummary(start, end);
  const [tenants, plans] = await Promise.all([
    rows.length ? db.query.tenants.findMany({ where: inArray(schema.tenants.id, rows.map((r) => r.tenant_id)) }) : Promise.resolve([]),
    db.query.plans.findMany(),
  ]);
  const earned = rows.reduce((a, r) => a + r.accrued + r.invoiced, 0);
  const awaiting = rows.reduce((a, r) => a + r.accrued, 0);
  const basis = rows.reduce((a, r) => a + r.basis, 0);
  const orders = rows.reduce((a, r) => a + r.orders, 0);
  const refunded = rows.reduce((a, r) => a + r.refunded, 0);
  const waived = rows.reduce((a, r) => a + r.waived, 0);

  return (
    <div className="space-y-6">
      <PageTitle title="Commissions" subtitle="What QuickPrint earns on paid orders, per shop. Each order is priced with the shop's terms at the moment it was paid." />
      <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Month">
        {months.map((x) => <Link key={x} href={`/superadmin/commissions?m=${x}`} className={`rounded-full border px-3 py-1 text-sm ${x === m ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 hover:bg-slate-50"}`}>{x}</Link>)}
        <a href={`/api/v1/superadmin/commissions/export?m=${m}`} className="ms-auto text-sm font-medium text-brand-600" data-testid="export-csv">Download CSV</a>
      </div>
      <div className="grid gap-4 md:grid-cols-5">
        <Stat label="Paid orders" value={orders} sub={`${formatAED(basis)} order value`} />
        <Stat label="Commission earned" value={<span data-testid="earned">{formatAED(earned)}</span>} sub={basis > 0 ? `${((earned / basis) * 100).toFixed(2)}% effective rate` : undefined} />
        <Stat label="Not yet invoiced" value={formatAED(awaiting)} sub="added to the next monthly invoice" />
        <Stat label="Refunded" value={formatAED(refunded)} sub="credited or removed" />
        <Stat label="Waived (trials, free)" value={formatAED(waived)} />
      </div>
      <Card>
        <CardHeader title={`By shop, ${m}`} />
        {rows.length === 0 ? <EmptyState title="No paid orders in this month" /> : (
          <Table head={["Shop", "Terms", "Orders", "Order value", "Earned", "Not yet invoiced", "Effective rate"]}>
            {rows.map((r) => {
              const t = tenants.find((x) => x.id === r.tenant_id);
              const rule = resolveRule(plans.find((p) => p.id === t?.planId) ?? null, t?.commissionOverride);
              const e = r.accrued + r.invoiced;
              return (
                <tr key={r.tenant_id}>
                  <td className="px-4 py-3"><Link href={`/superadmin/tenants/${r.tenant_id}`} className="font-medium text-brand-600">{r.name}</Link></td>
                  <td className="px-4 py-3 text-xs text-slate-600">{describeRule(rule)} {t?.commissionOverride && t.commissionOverride.mode !== "plan" && <Badge tone="purple">custom</Badge>}</td>
                  <td className="px-4 py-3 tabular-nums">{r.orders}</td>
                  <td className="px-4 py-3 tabular-nums">{formatAED(r.basis)}</td>
                  <td className="px-4 py-3 font-medium tabular-nums">{formatAED(e)}</td>
                  <td className="px-4 py-3 tabular-nums">{formatAED(r.accrued)}</td>
                  <td className="px-4 py-3 tabular-nums">{r.basis > 0 ? `${((e / r.basis) * 100).toFixed(2)}%` : "–"}</td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>
    </div>
  );
}
