import Link from "next/link";
import { Badge, Card, CardHeader, EmptyState, Stat } from "@/components/ui";
import { PageTitle, TENANT_STATUS_TONE, fmtDate } from "@/components/platform/PageTitle";
import { formatAED } from "@/lib/pricing";
import { platformMetrics } from "@/server/billing";

export const dynamic = "force-dynamic";

export default async function SuperadminDashboard() {
  const m = await platformMetrics();
  const max = Math.max(1, ...m.signups.map((s) => s.n));
  return (
    <>
      <PageTitle title="Platform overview" subtitle="All print shops on QuickPrint" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="MRR" value={formatAED(m.mrr)} sub={`ARR ${formatAED(m.arr)}`} />
        <Stat label="GMV this month" value={formatAED(m.gmv)} sub={`${m.orders} paid orders`} />
        <Stat label="Order fees earned (MTD)" value={formatAED(m.feesThisMonth)} />
        <Stat label="Print shops" value={m.total} sub={`${m.byStatus.active ?? 0} active · ${m.byStatus.trial ?? 0} trial`} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4" data-testid="walkin-tiles">
        <Stat label="Walk-in jobs (month)" value={m.walkIn.jobsThisMonth} sub={`${m.walkIn.printedThisMonth} printed`} />
        <Stat label="Walk-in GMV (month)" value={formatAED(m.walkIn.walkInGmvThisMonth)} />
        <Stat label="Print agents online" value={m.walkIn.agentsOnline} />
        <Stat label="Shops using walk-in" value={m.walkIn.shopsUsing} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="New signups" subtitle="Last 12 weeks" />
          {m.signups.length === 0 ? <EmptyState title="No signups yet" /> : (
            <div className="flex h-48 items-end gap-2 px-5 py-4">
              {m.signups.map((s) => (
                <div key={s.week} className="flex flex-1 flex-col items-center gap-1">
                  <span className="text-xs font-semibold">{s.n}</span>
                  <div className="w-full rounded-t bg-primary" style={{ height: `${(s.n / max) * 120}px` }} />
                  <span className="text-[10px] text-outline">{s.week.slice(5)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card>
          <CardHeader title="Shops by status" />
          <ul className="divide-y divide-outline-variant text-sm">
            {(["active", "trial", "past_due", "suspended", "cancelled"] as const).map((s) => (
              <li key={s} className="flex items-center justify-between px-5 py-3">
                <Badge tone={TENANT_STATUS_TONE[s]}>{s.replace("_", " ")}</Badge>
                <Link href={`/superadmin/tenants?status=${s}`} className="font-semibold hover:underline">{m.byStatus[s] ?? 0}</Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="Trials ending within 7 days" subtitle="Reach out before they lapse" />
        {m.expiringTrials.length === 0 ? <EmptyState title="Nothing expiring this week" /> : (
          <ul className="divide-y divide-outline-variant text-sm">
            {m.expiringTrials.map((t) => (
              <li key={t.id} className="flex items-center justify-between px-5 py-3">
                <Link href={`/superadmin/tenants/${t.id}`} className="font-medium hover:underline">{t.name}</Link>
                <span className="text-on-surface-variant">{t.phone ?? t.email} · ends {fmtDate(t.trialEndsAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
