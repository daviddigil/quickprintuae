import Link from "next/link";
import { aliasedTable, and, desc, eq, ilike, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";
import { Badge, Button, Card, EmptyState, Input, Select, Table } from "@/components/ui";
import { PageTitle, fmtDateTime } from "@/components/platform/PageTitle";

export const dynamic = "force-dynamic";

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ tenant?: string; action?: string; imp?: string }> }) {
  const sp = await searchParams;
  const actor = aliasedTable(schema.users, "actor");
  const imp = aliasedTable(schema.users, "imp");
  const conds: SQL[] = [];
  if (sp.tenant && /^[0-9a-f-]{36}$/.test(sp.tenant)) conds.push(eq(schema.auditLogs.tenantId, sp.tenant));
  if (sp.action) conds.push(ilike(schema.auditLogs.action, `%${sp.action}%`));
  const rows = await db.select({ a: schema.auditLogs, tenant: schema.tenants.name, actor: actor.email, imp: imp.email })
    .from(schema.auditLogs)
    .leftJoin(schema.tenants, eq(schema.tenants.id, schema.auditLogs.tenantId))
    .leftJoin(actor, eq(actor.id, schema.auditLogs.actorId))
    .leftJoin(imp, eq(imp.id, schema.auditLogs.impersonatorId))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(schema.auditLogs.createdAt)).limit(300);
  const filtered = sp.imp === "1" ? rows.filter((r) => r.a.impersonatorId) : rows;
  const tenants = await db.query.tenants.findMany({ columns: { id: true, name: true }, orderBy: schema.tenants.name });

  return (
    <>
      <PageTitle title="Audit log" subtitle="Every sensitive action, including everything done while impersonating." />
      <div className="mb-3 flex flex-wrap gap-2 text-sm" data-testid="audit-chips">
        {[["All", ""], ["Walk-in", "walkin"], ["Print agents", "agent."], ["Impersonation", "impersonate"]].map(([l, a]) => (
          <Link key={l} href={a ? `?action=${encodeURIComponent(a)}${sp.tenant ? `&tenant=${sp.tenant}` : ""}` : "?"} className={`rounded-full border px-3 py-1 ${((sp.action ?? "") === a) ? "border-brand-600 bg-brand-50 text-brand-700" : "bg-white hover:bg-slate-50"}`}>{l}</Link>
        ))}
      </div>
      <form className="mb-4 flex flex-wrap gap-2">
        <Select name="tenant" defaultValue={sp.tenant ?? ""} className="max-w-xs">
          <option value="">All shops</option>
          {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </Select>
        <Input name="action" defaultValue={sp.action} placeholder="Action contains…" className="max-w-xs" />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="imp" value="1" defaultChecked={sp.imp === "1"} /> Impersonated only</label>
        <Button variant="secondary">Filter</Button>
      </form>
      <Card>
        {filtered.length === 0 ? <EmptyState title="No entries" /> : (
          <Table head={["When (Dubai)", "Action", "Shop", "Actor", "Details", "IP"]}>
            {filtered.map(({ a, tenant, actor, imp }) => (
              <tr key={a.id} className="align-top">
                <td className="whitespace-nowrap px-4 py-2 text-xs">{fmtDateTime(a.createdAt)}</td>
                <td className="px-4 py-2 font-mono text-xs">{a.action}</td>
                <td className="px-4 py-2 text-xs">{a.tenantId ? <Link className="hover:underline" href={`/superadmin/tenants/${a.tenantId}`}>{tenant ?? "deleted"}</Link> : "platform"}</td>
                <td className="px-4 py-2 text-xs">{actor ?? "—"}{imp && <div className="mt-1"><Badge tone="yellow">via {imp}</Badge></div>}</td>
                <td className="max-w-xs truncate px-4 py-2 font-mono text-[11px] text-slate-500">{a.meta ? JSON.stringify(a.meta) : ""}</td>
                <td className="px-4 py-2 text-xs">{a.ip ?? ""}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
