import Link from "next/link";
import { notFound } from "next/navigation";
import { and, count, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { Alert, Badge, Button, Card, CardHeader, Field, Input, Select, Stat, Table } from "@/components/ui";
import { PageTitle, TENANT_STATUS_TONE, fmtDate, fmtDateTime } from "@/components/platform/PageTitle";
import { formatAED } from "@/lib/pricing";
import { getPlanUsage } from "@/server/billing";
import { deleteTenant, extendTrial, setTenantStatus, updateTenantDomain, updateTenantPlan } from "../../actions";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  confirm: "Type the store slug exactly to confirm deletion.",
  domain: "That doesn't look like a valid domain (e.g. print.myshop.ae).",
  domain_taken: "That domain is already used by another store.",
};

export default async function TenantDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params;
  const { error } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const t = await db.query.tenants.findFirst({ where: eq(schema.tenants.id, id) });
  if (!t) notFound();
  const [plans, usage, staff, invoices, [{ n: totalOrders }], recentAudit] = await Promise.all([
    db.query.plans.findMany({ orderBy: schema.plans.sortOrder }),
    getPlanUsage(t.id),
    db.query.users.findMany({ where: and(eq(schema.users.tenantId, t.id), inArray(schema.users.role, ["owner", "staff"])) }),
    db.query.saasInvoices.findMany({ where: eq(schema.saasInvoices.tenantId, t.id), orderBy: desc(schema.saasInvoices.periodStart), limit: 6 }),
    db.select({ n: count() }).from(schema.orders).where(eq(schema.orders.tenantId, t.id)),
    db.query.auditLogs.findMany({ where: eq(schema.auditLogs.tenantId, t.id), orderBy: desc(schema.auditLogs.createdAt), limit: 8 }),
  ]);

  return (
    <>
      <Link href="/superadmin/tenants" className="text-sm text-slate-500 hover:underline">← All print shops</Link>
      <PageTitle
        title={t.name}
        subtitle={`/s/${t.slug}${t.customDomain ? ` · ${t.customDomain}` : ""} · ${t.emirate}`}
        action={
          <div className="flex gap-2">
            <Link href={`/s/${t.slug}`} target="_blank" className="rounded-lg border bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50">View store ↗</Link>
            <form action="/api/v1/superadmin/impersonate" method="post">
              <input type="hidden" name="tenantId" value={t.id} />
              <Button>Impersonate owner</Button>
            </form>
          </div>
        }
      />
      {error && ERRORS[error] && <div className="mb-4"><Alert>{ERRORS[error]}</Alert></div>}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Status" value={<Badge tone={TENANT_STATUS_TONE[t.status]}>{t.status.replace("_", " ")}</Badge>} sub={t.status === "trial" ? `Trial ends ${fmtDate(t.trialEndsAt)}` : undefined} />
        <Stat label="Orders this month" value={usage.ordersThisMonth} sub={usage.maxOrders ? `of ${usage.maxOrders} allowed` : "unlimited"} />
        <Stat label="GMV this month" value={formatAED(usage.gmvThisMonth)} sub={`${totalOrders} orders all-time`} />
        <Stat label="Team" value={usage.staff} sub={usage.maxStaff ? `of ${usage.maxStaff} seats` : "unlimited"} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Business details" />
          <dl className="grid grid-cols-3 gap-y-2 px-5 py-4 text-sm">
            <dt className="text-slate-500">Legal name</dt><dd className="col-span-2">{t.legalName ?? "—"}</dd>
            <dt className="text-slate-500">TRN</dt><dd className="col-span-2">{t.trn ?? "—"}</dd>
            <dt className="text-slate-500">Email</dt><dd className="col-span-2">{t.email ?? "—"}</dd>
            <dt className="text-slate-500">Phone</dt><dd className="col-span-2">{t.phone ?? "—"}</dd>
            <dt className="text-slate-500">Address</dt><dd className="col-span-2">{t.address ?? "—"}</dd>
            <dt className="text-slate-500">Stripe customer</dt><dd className="col-span-2 font-mono text-xs">{t.stripeCustomerId ?? "none (no card on file)"}</dd>
            <dt className="text-slate-500">Joined</dt><dd className="col-span-2">{fmtDate(t.createdAt)}</dd>
          </dl>
        </Card>

        <Card>
          <CardHeader title="Subscription" />
          <div className="space-y-5 px-5 py-4">
            <form action={updateTenantPlan} className="grid items-end gap-2 sm:grid-cols-[2fr_1fr_auto]">
              <input type="hidden" name="tenantId" value={t.id} />
              <Field label="Plan">
                <Select name="planId" defaultValue={t.planId ?? ""}>
                  {plans.map((p) => <option key={p.id} value={p.id}>{p.name} — AED {p.priceMonthly}/mo</option>)}
                </Select>
              </Field>
              <Field label="Cycle">
                <Select name="billingCycle" defaultValue={t.billingCycle}><option value="monthly">Monthly</option><option value="yearly">Yearly</option></Select>
              </Field>
              <Button variant="secondary">Save plan</Button>
            </form>
            <form action={extendTrial} className="flex items-end gap-2">
              <input type="hidden" name="tenantId" value={t.id} />
              <Field label="Extend trial (days)"><Input name="days" type="number" min={1} max={90} defaultValue={7} className="w-28" /></Field>
              <Button variant="secondary">Extend</Button>
            </form>
            <div className="flex flex-wrap gap-2">
              {t.status !== "suspended" ? (
                <form action={setTenantStatus}><input type="hidden" name="tenantId" value={t.id} /><input type="hidden" name="status" value="suspended" /><Button variant="danger">Suspend store</Button></form>
              ) : (
                <form action={setTenantStatus}><input type="hidden" name="tenantId" value={t.id} /><input type="hidden" name="status" value="active" /><Button>Reactivate</Button></form>
              )}
              {t.status !== "active" && t.status !== "suspended" && (
                <form action={setTenantStatus}><input type="hidden" name="tenantId" value={t.id} /><input type="hidden" name="status" value="active" /><Button variant="secondary">Mark active</Button></form>
              )}
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Custom domain" subtitle="Customer CNAMEs their domain to the platform; TLS is issued on demand." />
          <form action={updateTenantDomain} className="flex items-end gap-2 px-5 py-4">
            <input type="hidden" name="tenantId" value={t.id} />
            <div className="flex-1"><Field label="Domain"><Input name="customDomain" defaultValue={t.customDomain ?? ""} placeholder="print.myshop.ae" /></Field></div>
            <Button variant="secondary">Save</Button>
          </form>
        </Card>

        <Card>
          <CardHeader title="Team" />
          <ul className="divide-y divide-slate-100 text-sm">
            {staff.map((u) => (
              <li key={u.id} className="flex items-center justify-between px-5 py-2.5">
                <span>{u.name} <span className="text-slate-500">· {u.email}</span></span>
                <span className="flex items-center gap-2"><Badge tone={u.role === "owner" ? "purple" : "gray"}>{u.role}</Badge>{!u.active && <Badge tone="red">disabled</Badge>}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader title="Recent SaaS invoices" action={<Link href="/superadmin/invoices" className="text-sm text-brand-600">All →</Link>} />
          <Table head={["Invoice", "Period", "Total", "Status"]}>
            {invoices.map((i) => (
              <tr key={i.id}><td className="px-4 py-2 font-mono text-xs">{i.number}</td><td className="px-4 py-2">{fmtDate(i.periodStart)}</td><td className="px-4 py-2">{formatAED(i.total)}</td><td className="px-4 py-2"><Badge tone={i.status === "paid" ? "green" : i.status === "open" ? "yellow" : "gray"}>{i.status}</Badge></td></tr>
            ))}
          </Table>
        </Card>

        <Card>
          <CardHeader title="Recent activity" action={<Link href={`/superadmin/audit?tenant=${t.id}`} className="text-sm text-brand-600">Audit log →</Link>} />
          <ul className="divide-y divide-slate-100 text-sm">
            {recentAudit.map((a) => (
              <li key={a.id} className="flex justify-between px-5 py-2"><span className="font-mono text-xs">{a.action}{a.impersonatorId && <Badge tone="yellow">impersonated</Badge>}</span><span className="text-xs text-slate-500">{fmtDateTime(a.createdAt)}</span></li>
            ))}
          </ul>
        </Card>
      </div>

      <Card className="mt-6 border-red-200">
        <CardHeader title="Danger zone" subtitle="Deletes the store, its products, orders, customers and files records. This cannot be undone." />
        <form action={deleteTenant} className="flex flex-wrap items-end gap-2 px-5 py-4">
          <input type="hidden" name="tenantId" value={t.id} />
          <Field label={`Type "${t.slug}" to confirm`}><Input name="confirm" autoComplete="off" className="w-64" /></Field>
          <Button variant="danger">Delete tenant permanently</Button>
        </form>
      </Card>
    </>
  );
}
