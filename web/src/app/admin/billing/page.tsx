import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireStaff } from "@/lib/auth";
import { formatAED } from "@/lib/pricing";
import { Alert, Badge, Card, CardHeader, EmptyState, Stat, Table } from "@/components/ui";
import { PageHeader } from "@/components/admin/PageHeader";
import { dubai } from "@/components/admin/format";
import { PLAN_FLAGS, displayFeatures } from "@/server/billing/flags";
import { describeRule } from "@/lib/commission";
import { changeBillingPlan } from "../actions";
import { USAGE_KINDS } from "@/lib/usage";
import { usageForPeriod } from "@/server/usage";
import { ensurePlans } from "@/server/provision";
import { effectiveRuleForTenant, ensureCommissionsForPeriod } from "@/server/commission";

export const metadata = { title: "Plan & billing" };
const INV_TONE = { draft: "gray", open: "yellow", paid: "green", void: "gray" } as const;

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const sp = await searchParams;
  const { tenant } = await requireStaff();
  const plan = tenant.planId ? await db.query.plans.findFirst({ where: eq(schema.plans.id, tenant.planId) }) : null;
  const monthStart = new Date(new Date().toISOString().slice(0, 7) + "-01T00:00:00+04:00");
  const [usage] = await db.select({ n: sql<number>`count(*)::int`, gmv: sql<number>`coalesce(sum(${schema.orders.total}) filter (where ${schema.orders.paidAt} is not null),0)::float` })
    .from(schema.orders).where(and(eq(schema.orders.tenantId, tenant.id), gte(schema.orders.createdAt, monthStart)));
  const invoices = await db.query.saasInvoices.findMany({ where: eq(schema.saasInvoices.tenantId, tenant.id), orderBy: [desc(schema.saasInvoices.periodStart)], limit: 24 });
  // commission the platform charges this shop: current terms + this month's per-order statement
  const monthEnd = new Date(new Date(monthStart).getTime() + 32 * 86400_000); monthEnd.setUTCDate(1); monthEnd.setUTCHours(-4, 0, 0, 0);
  await ensureCommissionsForPeriod(tenant.id, monthStart, monthEnd);
  const { rule } = await effectiveRuleForTenant(tenant);
  const ledger = await db.select({ number: schema.orders.number, paidAt: schema.orders.paidAt, basis: schema.orderCommissions.basis, fee: schema.orderCommissions.fee, status: schema.orderCommissions.status })
    .from(schema.orderCommissions).innerJoin(schema.orders, eq(schema.orders.id, schema.orderCommissions.orderId))
    .where(and(eq(schema.orderCommissions.tenantId, tenant.id), gte(schema.orders.paidAt, monthStart), lt(schema.orders.paidAt, monthEnd))).orderBy(desc(schema.orders.paidAt)).limit(200);
  const feeTotal = ledger.filter((r) => r.status === "accrued" || r.status === "invoiced").reduce((a, r) => a + r.fee, 0);
  await ensurePlans(db);
  const allPlans = (await db.query.plans.findMany({ orderBy: [schema.plans.sortOrder] })).filter((p) => p.active);
  const pendingPlan = tenant.pendingPlanId ? allPlans.find((p) => p.id === tenant.pendingPlanId) : null;
  const usageNow = await usageForPeriod(tenant.id, monthStart, monthEnd, plan?.includedUsage ?? {});
  const isCommissionPlan = plan?.billingModel === "commission";
  const pct = plan?.maxOrdersPerMonth ? Math.min(100, Math.round((usage.n / plan.maxOrdersPerMonth) * 100)) : 0;
  const trialDays = tenant.trialEndsAt ? Math.ceil((tenant.trialEndsAt.getTime() - Date.now()) / 86400_000) : null;
  const price = tenant.billingCycle === "yearly" ? plan?.priceYearly : plan?.priceMonthly;

  return (
    <div className="space-y-6">
      <PageHeader title="Plan & billing" subtitle="Choose how you pay QuickPrint: a flat monthly subscription, or a commission on each paid order." />
      {sp.ok && <Alert tone="green">{sp.ok}</Alert>}
      {sp.error && <Alert>{sp.error}</Alert>}
      {tenant.status === "past_due" && <Alert>Your last invoice is overdue. Please pay to avoid suspension of your storefront.</Alert>}
      <div className="grid gap-4 md:grid-cols-4">
        <Stat label="Current plan" value={plan?.name ?? "—"} sub={isCommissionPlan ? "No monthly fee · commission per order" : price !== undefined ? `${formatAED(price)} / ${tenant.billingCycle === "yearly" ? "year" : "month"} · no commission` : undefined} />
        <Stat label="Status" value={<span className="capitalize">{tenant.status.replace("_", " ")}</span>}
          sub={tenant.status === "trial" && trialDays !== null ? `Trial ends ${dubai(tenant.trialEndsAt, "d MMM yyyy")} (${Math.max(0, trialDays)} days)` : tenant.currentPeriodEnd ? `Renews ${dubai(tenant.currentPeriodEnd, "d MMM yyyy")}` : undefined} />
        <Stat label="Orders this month" value={`${usage.n}${plan?.maxOrdersPerMonth ? ` / ${plan.maxOrdersPerMonth}` : ""}`} sub={plan?.maxOrdersPerMonth ? <span className="mt-1 block h-1.5 w-full overflow-hidden rounded bg-slate-200"><span className={`block h-full ${pct > 85 ? "bg-red-500" : "bg-emerald-500"}`} style={{ width: `${pct}%` }} /></span> : "Unlimited"} />
        <Stat label="Paid sales this month" value={formatAED(usage.gmv)} sub={`Platform commission ${formatAED(feeTotal)}`} />
      </div>
      <Card data-testid="billing-model">
        <CardHeader title="How you pay" subtitle={tenant.status === "trial" ? "Switching during your trial is instant." : "A change takes effect at the start of next month, so this month is billed on your current terms."} />
        {pendingPlan && (
          <form action={changeBillingPlan} className="mx-5 mt-4 flex items-center justify-between rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900" data-testid="pending-change">
            <span>Switching to <b>{pendingPlan.name}</b> on {dubai(tenant.pendingPlanAt, "d MMM yyyy")}.</span>
            <button name="cancel" value="1" className="font-medium underline">Cancel change</button>
          </form>
        )}
        <div className="grid gap-3 p-5 md:grid-cols-2 lg:grid-cols-4">
          {allPlans.map((p) => {
            const cur = p.id === tenant.planId;
            return (
              <form key={p.id} action={changeBillingPlan} className={`rounded-xl border p-4 text-sm ${cur ? "border-emerald-500 bg-emerald-50" : "border-slate-200"}`} data-testid={`plan-${p.code}`}>
                <input type="hidden" name="planId" value={p.id} />
                <p className="font-semibold">{p.name}</p>
                <p className="mt-1 text-slate-600">{p.billingModel === "commission" ? `No monthly fee + ${p.orderFeePct}% per order` : `${formatAED(p.priceMonthly)} / month, no commission`}</p>
                <p className="mt-1 text-xs text-slate-500">{p.billingModel === "commission" ? "Pay only when you sell" : "Predictable cost"}</p>
                {cur ? <Badge tone="green">Current plan</Badge> : <button className="mt-3 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white">Switch</button>}
              </form>
            );
          })}
        </div>
      </Card>
      <Card data-testid="usage-card">
        <CardHeader title="Pay-as-you-go usage this month" subtitle="WhatsApp (Meta API) messages and AI are billed on your monthly invoice, on top of your plan, at the rates below." />
        {usageNow.lines.length === 0 ? <EmptyState title="No usage yet this month" /> : (
          <Table head={["Item", "Used", "Free included", "Rate", "Charge"]}>
            {usageNow.lines.map((l) => (
              <tr key={l.kind}><td className="px-4 py-2.5 font-medium">{l.label}</td><td className="px-4 py-2.5 tabular-nums">{l.qty}</td>
                <td className="px-4 py-2.5 tabular-nums">{l.included}</td><td className="px-4 py-2.5 tabular-nums">{l.rate ? `AED ${l.rate}` : "Free"}</td>
                <td className="px-4 py-2.5 tabular-nums">{formatAED(l.amount)}</td></tr>
            ))}
          </Table>
        )}
        <p className="px-5 py-3 text-xs text-slate-500" data-testid="usage-total">Usage so far: {formatAED(usageNow.total)} (+5% VAT). Tracked: {USAGE_KINDS.map((k) => k.label).join(", ")}.</p>
      </Card>
      <Card data-testid="commission-statement">
        <CardHeader title="Commission on your orders" subtitle="Charged on the value of each paid order excluding VAT and delivery, and added to your monthly invoice. No commission during your free trial." />
        <p className="px-5 pt-4 text-sm"><span className="font-medium">Your terms:</span> <span data-testid="my-terms">{describeRule(rule)}</span>{rule.source === "custom" && <> <Badge tone="purple">custom terms</Badge></>}</p>
        {ledger.length === 0 ? <EmptyState title="No paid orders this month yet" /> : (
          <Table head={["Order", "Paid", "Order value", "Commission", "Status"]}>
            {ledger.map((r) => (
              <tr key={r.number}><td className="px-4 py-2.5 font-medium">{r.number}</td><td className="px-4 py-2.5 text-slate-600">{dubai(r.paidAt, "d MMM, HH:mm")}</td>
                <td className="px-4 py-2.5 tabular-nums">{formatAED(r.basis)}</td><td className="px-4 py-2.5 tabular-nums">{formatAED(r.fee)}</td>
                <td className="px-4 py-2.5 text-xs capitalize text-slate-600">{r.status === "waived" ? "Not charged" : r.status === "refunded" ? "Refunded" : r.status === "invoiced" ? "Invoiced" : "To be invoiced"}</td></tr>
            ))}
          </Table>
        )}
      </Card>
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
          <Table head={["Invoice", "Period", "Subscription", "Order fees", "Usage", "VAT", "Total", "Status"]}>
            {invoices.map((i) => (
              <tr key={i.id}>
                <td className="px-4 py-3 font-medium">{i.number}</td>
                <td className="px-4 py-3 text-xs">{dubai(i.periodStart, "d MMM")} – {dubai(i.periodEnd, "d MMM yyyy")}</td>
                <td className="px-4 py-3">{formatAED(i.subscriptionAmount)}</td>
                <td className="px-4 py-3">{formatAED(i.orderFeeAmount)}</td>
                <td className="px-4 py-3">{formatAED(i.usageAmount)}</td>
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
