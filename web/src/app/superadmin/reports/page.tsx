import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireSuperadmin } from "@/lib/auth";
import { REPORT_STATUSES } from "@/lib/compliance";
import { Alert, Badge, Button, Card, CardHeader, EmptyState, Field, Select, Table, Textarea } from "@/components/ui";
import { PageTitle, fmtDateTime } from "@/components/platform/PageTitle";
import { blockCustomer, saveReport } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Content reports" };
const TONE = { open: "red", reviewing: "yellow", actioned: "green", rejected: "gray" } as const;

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ status?: string; id?: string; ok?: string; error?: string }> }) {
  await requireSuperadmin();
  const sp = await searchParams;
  const status = (REPORT_STATUSES as readonly string[]).includes(sp.status ?? "") ? sp.status! : undefined;
  const rows = await db.select({ r: schema.contentReports, shop: schema.tenants.name }).from(schema.contentReports)
    .leftJoin(schema.tenants, eq(schema.tenants.id, schema.contentReports.tenantId))
    .where(status ? eq(schema.contentReports.status, status) : undefined).orderBy(desc(schema.contentReports.createdAt)).limit(200);
  const open = /^[0-9a-f-]{36}$/i.test(sp.id ?? "") ? await db.query.contentReports.findFirst({ where: eq(schema.contentReports.id, sp.id!) }) : null;
  const order = open?.orderId ? await db.query.orders.findFirst({ where: eq(schema.orders.id, open.orderId) }) : null;
  return (
    <>
      <PageTitle title="Content reports" subtitle="Takedown and abuse reports from the public form. Every change is audited." />
      {sp.error && <div className="mb-4"><Alert tone="red">{sp.error}</Alert></div>}
      {sp.ok && <div className="mb-4"><Alert tone="green">{sp.ok}</Alert></div>}
      <nav aria-label="Status filter" className="mb-4 flex flex-wrap gap-2 text-sm">
        {[["All", ""], ...REPORT_STATUSES.map((s) => [s, s])].map(([l, v]) => (
          <Link key={v} href={`/superadmin/reports${v ? `?status=${v}` : ""}`} aria-current={(status ?? "") === v ? "page" : undefined}
            className={`inline-flex min-h-11 items-center rounded-full border px-4 font-medium capitalize ${(status ?? "") === v ? "border-primary bg-primary-container text-on-primary-container" : "border-outline-variant"}`}>{l}</Link>
        ))}
      </nav>
      {open && (
        <Card className="mb-6" data-testid="report-detail">
          <CardHeader title={`Report ${open.id.slice(0, 8)}`} subtitle={`${open.category.replace("_", " ")} · received ${fmtDateTime(open.createdAt)}`} />
          <div className="space-y-3 px-5 pb-5 text-sm">
            <p className="whitespace-pre-wrap">{open.description}</p>
            <dl className="grid gap-1 text-on-surface-variant sm:grid-cols-2">
              <div>Reporter: {open.reporterName || "-"} {open.reporterEmail ? `<${open.reporterEmail}>` : ""}</div>
              <div>Link: {open.url || "-"}</div>
              <div>Order: {order ? <Link className="underline" href={`/superadmin/tenants/${order.tenantId}`}>{order.number}</Link> : "-"}</div>
              <div>Handled: {open.handledAt ? fmtDateTime(open.handledAt) : "not yet"}</div>
            </dl>
            <form action={saveReport} className="grid gap-3 sm:grid-cols-[12rem_1fr_auto] sm:items-end">
              <input type="hidden" name="id" value={open.id} />
              <Field label="Status"><Select name="status" defaultValue={open.status}>{REPORT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</Select></Field>
              <Field label="Resolution" hint="(required to close)"><Textarea name="resolution" rows={2} defaultValue={open.resolution ?? ""} maxLength={2000} /></Field>
              <Button>Save</Button>
            </form>
            {order?.customerId && (
              <form action={blockCustomer}><input type="hidden" name="id" value={open.id} /><Button variant="danger">Block the customer account on this order</Button></form>
            )}
          </div>
        </Card>
      )}
      <Card>
        {rows.length === 0 ? <EmptyState title="No reports" /> : (
          <Table head={["Received", "Category", "Shop", "Reporter", "Status", ""]}>
            {rows.map(({ r, shop }) => (
              <tr key={r.id} data-testid="report-row">
                <td className="px-4 py-3 text-xs">{fmtDateTime(r.createdAt)}</td>
                <td className="px-4 py-3 capitalize">{r.category.replace("_", " ")}</td>
                <td className="px-4 py-3">{shop ?? "-"}</td>
                <td className="px-4 py-3 text-xs">{r.reporterEmail ?? "anonymous"}</td>
                <td className="px-4 py-3"><Badge tone={TONE[r.status as keyof typeof TONE] ?? "gray"}>{r.status}</Badge></td>
                <td className="px-4 py-3 text-end"><Link className="inline-flex min-h-11 items-center font-semibold text-primary hover:underline" href={`/superadmin/reports?${status ? `status=${status}&` : ""}id=${r.id}`}>Open</Link></td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
