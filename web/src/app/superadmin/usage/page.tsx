import { and, eq, gte, lt, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireSuperadmin } from "@/lib/auth";
import { Alert, Button, Card, CardHeader, EmptyState, Input, Stat, Table } from "@/components/ui";
import { PageTitle } from "@/components/platform/PageTitle";
import { formatAED } from "@/lib/pricing";
import { USAGE_KINDS, computeUsageCharges } from "@/lib/usage";
import { usageRatesMap } from "@/server/usage";
import { saveUsageRates } from "../actions";

export const metadata = { title: "Usage billing" };
export const dynamic = "force-dynamic";

export default async function UsagePage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  await requireSuperadmin();
  const sp = await searchParams;
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const rateRows = await db.query.usageRates.findMany();
  const rates = await usageRatesMap();
  const rows = await db.select({ tenantId: schema.usageEvents.tenantId, kind: schema.usageEvents.kind, n: sql<number>`coalesce(sum(${schema.usageEvents.quantity}),0)::int`, tin: sql<number>`coalesce(sum(${schema.usageEvents.tokensIn}),0)::int`, tout: sql<number>`coalesce(sum(${schema.usageEvents.tokensOut}),0)::int` })
    .from(schema.usageEvents).where(and(eq(schema.usageEvents.billable, true), gte(schema.usageEvents.createdAt, start), lt(schema.usageEvents.createdAt, end))).groupBy(schema.usageEvents.tenantId, schema.usageEvents.kind);
  const tenants = await db.query.tenants.findMany();
  const plans = await db.query.plans.findMany();
  const byTenant = new Map<string, Record<string, number>>();
  let tokens = 0;
  for (const r of rows) { byTenant.set(r.tenantId, { ...(byTenant.get(r.tenantId) ?? {}), [r.kind]: Number(r.n) }); tokens += Number(r.tin) + Number(r.tout); }
  const table = [...byTenant.entries()].map(([id, counts]) => {
    const t = tenants.find((x) => x.id === id);
    const plan = plans.find((p) => p.id === t?.planId);
    return { id, name: t?.name ?? id, counts, charge: computeUsageCharges(counts, rates, plan?.includedUsage ?? {}).total };
  }).sort((a, b) => b.charge - a.charge);
  const revenue = table.reduce((s, r) => s + r.charge, 0);
  return (
    <div className="space-y-6">
      <PageTitle title="Usage billing" subtitle="Pay-as-you-go charges for WhatsApp (Meta API) messages and AI. Rates apply to every shop; free allowances are set per plan." />
      {sp.saved && <Alert tone="green">Rates saved</Alert>}
      {sp.error && <Alert>Rate must be between 0 and 100 AED</Alert>}
      <div className="grid gap-4 md:grid-cols-3">
        <Stat label="Usage revenue this month" value={formatAED(revenue)} />
        <Stat label="Shops with usage" value={table.length} />
        <Stat label="Claude tokens this month" value={tokens.toLocaleString()} />
      </div>
      <Card data-testid="usage-rates">
        <CardHeader title="Rate card (AED per unit, ex VAT)" subtitle="0 or inactive = not billed. Set your Meta conversation cost + margin here." />
        <form action={saveUsageRates} className="grid gap-3 p-5 sm:grid-cols-2">
          {USAGE_KINDS.map((k) => {
            const row = rateRows.find((r) => r.kind === k.kind);
            return (
              <div key={k.kind} className="flex items-end gap-3">
                <label className="flex-1 text-sm font-medium">{k.label} <span className="text-xs text-on-surface-variant">per {k.unit}</span>
                  <Input name={`rate_${k.kind}`} type="number" step="0.0001" min="0" max="100" defaultValue={row?.priceAed ?? 0} /></label>
                <label className="pb-2 text-xs"><input type="checkbox" name={`active_${k.kind}`} defaultChecked={row?.active ?? true} /> active</label>
              </div>
            );
          })}
          <div className="sm:col-span-2"><Button>Save rates</Button></div>
        </form>
      </Card>
      <Card>
        <CardHeader title="Usage by shop this month" />
        {table.length === 0 ? <EmptyState title="No usage recorded yet" /> : (
          <Table head={["Shop", ...USAGE_KINDS.map((k) => k.label), "Charge"]}>
            {table.map((r) => (
              <tr key={r.id}><td className="px-4 py-2.5 font-medium">{r.name}</td>
                {USAGE_KINDS.map((k) => <td key={k.kind} className="px-4 py-2.5 tabular-nums">{r.counts[k.kind] ?? 0}</td>)}
                <td className="px-4 py-2.5 tabular-nums">{formatAED(r.charge)}</td></tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
