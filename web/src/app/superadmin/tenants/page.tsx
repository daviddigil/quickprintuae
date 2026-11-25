import Link from "next/link";
import { and, desc, eq, ilike, or, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";
import { Badge, Button, Card, EmptyState, Input, Select, Table } from "@/components/ui";
import { PageTitle, TENANT_STATUS_TONE, fmtDate } from "@/components/platform/PageTitle";

export const dynamic = "force-dynamic";
type St = keyof typeof TENANT_STATUS_TONE;

export default async function TenantsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; deleted?: string }> }) {
  const { q, status, deleted } = await searchParams;
  const conds: SQL[] = [];
  if (q) conds.push(or(ilike(schema.tenants.name, `%${q}%`), ilike(schema.tenants.slug, `%${q}%`), ilike(schema.tenants.email, `%${q}%`))!);
  if (status && status in TENANT_STATUS_TONE) conds.push(eq(schema.tenants.status, status as St));
  const rows = await db
    .select({ t: schema.tenants, plan: schema.plans.name })
    .from(schema.tenants)
    .leftJoin(schema.plans, eq(schema.plans.id, schema.tenants.planId))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(schema.tenants.createdAt))
    .limit(200);

  return (
    <>
      <PageTitle title="Print shops" subtitle={`${rows.length} shown`} />
      {deleted && <p className="mb-4 rounded-lg bg-success-container px-4 py-2 text-sm text-success">Tenant deleted.</p>}
      <form className="mb-4 flex flex-wrap gap-2">
        <Input name="q" defaultValue={q} placeholder="Search name, slug or email" className="max-w-xs" />
        <Select name="status" defaultValue={status ?? ""} className="max-w-[180px]">
          <option value="">All statuses</option>
          {Object.keys(TENANT_STATUS_TONE).map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
        </Select>
        <Button variant="secondary">Filter</Button>
      </form>
      <Card>
        {rows.length === 0 ? <EmptyState title="No print shops match" /> : (
          <Table head={["Shop", "Plan", "Status", "Emirate", "Contact", "Created", ""]}>
            {rows.map(({ t, plan }) => (
              <tr key={t.id} className="hover:bg-surface-low">
                <td className="px-4 py-3"><Link href={`/superadmin/tenants/${t.id}`} className="font-medium hover:underline">{t.name}</Link>{t.settings?.walkIn?.enabled && <span className="ml-2"><Badge tone="purple">walk-in</Badge></span>}<div className="text-xs text-on-surface-variant">/{t.slug}{t.customDomain ? ` · ${t.customDomain}` : ""}</div></td>
                <td className="px-4 py-3">{plan ?? "—"} <span className="text-xs text-outline">{t.billingCycle}</span></td>
                <td className="px-4 py-3"><Badge tone={TENANT_STATUS_TONE[t.status]}>{t.status.replace("_", " ")}</Badge></td>
                <td className="px-4 py-3">{t.emirate}</td>
                <td className="px-4 py-3 text-xs">{t.email}<br />{t.phone}</td>
                <td className="px-4 py-3 text-xs">{fmtDate(t.createdAt)}</td>
                <td className="px-4 py-3 text-right">
                  <form action="/api/v1/superadmin/impersonate" method="post">
                    <input type="hidden" name="tenantId" value={t.id} />
                    <button className="text-xs font-semibold text-primary hover:underline">Impersonate</button>
                  </form>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
