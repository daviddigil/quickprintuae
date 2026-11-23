import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireStaff } from "@/lib/auth";
import { formatAED } from "@/lib/pricing";
import { Alert, Badge, Card, CardHeader, EmptyState, Stat, Table } from "@/components/ui";
import { PageHeader } from "@/components/admin/PageHeader";
import { dubai } from "@/components/admin/format";
import { PLAN_FLAGS, displayFeatures } from "@/server/billing/flags";

export const metadata = { title: "Plan & billing" };
const INV_TONE = { draft: "gray", open: "yellow", paid: "green", void: "gray" } as const;

export default async function BillingPage() {
  const { tenant } = await requireStaff();
  const plan = tenant.planId ? await db.query.plans.findFirst({ where: eq(schema.plans.id, tenant.planId) }) : null;
  const monthStart = new Date(new Date().toISOString().slice(0, 7) + "-01T00:00:00+04:00");
  const [usage] = await db.select({ n: sql<number>`count(*)::int`, gmv: sql<number>`coalesce(sum(${schema.orders.total}) filter (where ${schema.orders.paidAt} is not null),0)::float` })
    .from(schema.orders).where(and(eq(schema.orders.tenantId, tenant.id), gte(schema.orders.createdAt, monthStart)));
  const invoices = await db.query.saasInvoices.findMany({ where: eq(schema.saasInvoices.tenantId, tenant.id), orderBy: [desc(schema.saasInvoices.periodStart)], limit: 24 });
  const pct = plan?.maxOrdersPerMonth ? Math.min(100, Math.round((usage.n / plan.maxOrdersPerMonth) * 100)) : 0;
  const trialDays = tenant.trialEndsAt ? Math.ceil((tenant.trialEndsAt.getTime() - Date.now()) / 86400_000) : null;
  const price = tenant.billingCycle === "yearly" ? plan?.priceYearly : plan?.priceMonthly;

  return (
    <div className="space-y-6">
      <PageHeader title="Plan & billing" subtitle="Your QuickPrint subscription. To change plans, contact platform support." />
      {tenant.status === "past_due" && <Alert>Your last invoice is overdue. Please pay to avoid suspension of your storefront.</Alert>}
      <div className="grid gap-4 md:grid-cols-4">
        <Stat label="Current plan" value={plan?.name ?? "—"} sub={price !== undefined ? `${formatAED(price)} / ${tenant.billingCycle === "yearly" ? "year" : "month"} + ${plan?.orderFeePct ?? 0}% per order` : undefined} />
        <Stat label="Status" value={<span className="capitalize">{tenant.status.replace("_", " ")}</span>}
          sub={tenant.status === "trial" && trialDays !== null ? `Trial ends ${dubai(tenant.trialEndsAt, "d MMM yyyy")} (${Math.max(0, trialDays)} days)` : tenant.currentPeriodEnd ? `Renews ${dubai(tenant.currentPeriodEnd, "d MMM yyyy")}` : undefined} />
        <Stat label="Orders this month" value={`${usage.n}${plan?.maxOrdersPerMonth ? ` / ${plan.maxOrdersPerMonth}` : ""}`} sub={plan?.maxOrdersPerMonth ? <span className="mt-1 block h-1.5 w-full overflow-hidden rounded bg-slate-200"><span className={`block h-full ${pct > 85 ? "bg-red-500" : "bg-emerald-500"}`} style={{ width: `${pct}%` }} /></span> : "Unlimited"} />
        <Stat label="Paid sales this month" value={formatAED(usage.gmv)} sub={plan ? `Est. platform fee ${formatAED((usage.gmv * plan.orderFeePct) / 100)}` : undefined} />
      </div>
      {plan && (
        <Card>
          <CardHeader title={`${plan.name} includes`} />
          <ul className="grid gap-2 p-5 text-sm sm:grid-cols-2">{displayFeatures(plan.features, plan.flags).map((f) => <li key={f}>✓ {f}</li>)}</ul>
          <div className="border-t border-slate-100 px-5 py-4 text-sm" data-testid="plan-flags">
            <p className="mb-2 font-medium">Feature access</p>
            <ul className="space-y-1">
              {PLAN_FLAGS.map((f) => (
                <li key={f.key}>{plan.flags?.includes(f.key) ? <span className="text-emerald-700">✓ {f.label}</span> : <span className="text-slate-500">✕ {f.label} — not in your plan. Contact support to upgrade.</span>}</li>
              ))}
            </ul>
          </div>
        </Card>
      )}
      <Card>
        <CardHeader title="Invoices" />
        {invoices.length === 0 ? <EmptyState title="No invoices yet" /> : (
          <Table head={["Invoice", "Period", "Subscription", "Order fees", "VAT", "Total", "Status"]}>
            {invoices.map((i) => (
              <tr key={i.id}>
                <td className="px-4 py-3 font-medium">{i.number}</td>
                <td className="px-4 py-3 text-xs">{dubai(i.periodStart, "d MMM")} – {dubai(i.periodEnd, "d MMM yyyy")}</td>
                <td className="px-4 py-3">{formatAED(i.subscriptionAmount)}</td>
                <td className="px-4 py-3">{formatAED(i.orderFeeAmount)}</td>
                <td className="px-4 py-3">{formatAED(i.vat)}</td>
                <td className="px-4 py-3 font-semibold">{formatAED(i.total)}</td>
                <td className="px-4 py-3"><Badge tone={INV_TONE[i.status]}>{i.status}</Badge></td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
