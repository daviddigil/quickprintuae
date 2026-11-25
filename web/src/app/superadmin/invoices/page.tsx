import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { Alert, Badge, Button, Card, EmptyState, Input, Select, Table } from "@/components/ui";
import { PageTitle, fmtDate } from "@/components/platform/PageTitle";
import { formatAED } from "@/lib/pricing";
import { invoiceAction, runInvoiceGeneration } from "../actions";

export const dynamic = "force-dynamic";
type S = "draft" | "open" | "paid" | "void";

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ status?: string; generated?: string; collect?: string; msg?: string }> }) {
  const sp = await searchParams;
  const status = ["draft", "open", "paid", "void"].includes(sp.status ?? "") ? (sp.status as S) : undefined;
  const rows = await db.select({ i: schema.saasInvoices, tenant: schema.tenants.name })
    .from(schema.saasInvoices).innerJoin(schema.tenants, eq(schema.tenants.id, schema.saasInvoices.tenantId))
    .where(status ? eq(schema.saasInvoices.status, status) : undefined)
    .orderBy(desc(schema.saasInvoices.createdAt)).limit(300);
  const outstanding = rows.filter((r) => r.i.status === "open").reduce((a, r) => a + r.i.total, 0);
  const lastMonth = new Date(); lastMonth.setUTCMonth(lastMonth.getUTCMonth() - 1);

  return (
    <>
      <PageTitle title="SaaS invoices" subtitle={`Outstanding: ${formatAED(outstanding)}`}
        action={
          <form action={runInvoiceGeneration} className="flex items-end gap-2">
            <Input type="month" name="month" defaultValue={lastMonth.toISOString().slice(0, 7)} className="w-44" />
            <Button>Generate invoices</Button>
          </form>
        } />
      {sp.generated && <div className="mb-4"><Alert tone="green">{sp.generated} invoice(s) generated (already-billed shops are skipped).</Alert></div>}
      {sp.collect && <div className="mb-4"><Alert tone={sp.collect === "paid" ? "green" : "yellow"}>Collection result: {sp.collect}{sp.msg ? ` — ${sp.msg}` : ""}</Alert></div>}
      <form className="mb-4 flex gap-2">
        <Select name="status" defaultValue={status ?? ""} className="max-w-[160px]">
          <option value="">All</option><option value="open">Open</option><option value="paid">Paid</option><option value="void">Void</option>
        </Select>
        <Button variant="secondary">Filter</Button>
      </form>
      <Card>
        {rows.length === 0 ? <EmptyState title="No invoices yet">Generate them for a month above, or wait for the daily billing cron.</EmptyState> : (
          <Table head={["Invoice", "Shop", "Period", "Subscription", "Order fees", "VAT", "Total", "Status", ""]}>
            {rows.map(({ i, tenant }) => (
              <tr key={i.id}>
                <td className="px-4 py-3 font-mono text-xs">{i.number}</td>
                <td className="px-4 py-3"><Link className="hover:underline" href={`/superadmin/tenants/${i.tenantId}`}>{tenant}</Link></td>
                <td className="px-4 py-3 text-xs">{fmtDate(i.periodStart)}</td>
                <td className="px-4 py-3">{formatAED(i.subscriptionAmount)}</td>
                <td className="px-4 py-3">{formatAED(i.orderFeeAmount)}<div className="text-xs text-outline">GMV {formatAED(i.gmv)}</div></td>
                <td className="px-4 py-3">{formatAED(i.vat)}</td>
                <td className="px-4 py-3 font-semibold">{formatAED(i.total)}</td>
                <td className="px-4 py-3"><Badge tone={i.status === "paid" ? "green" : i.status === "open" ? "yellow" : "gray"}>{i.status}</Badge></td>
                <td className="px-4 py-3">
                  {i.status === "open" && (
                    <div className="flex gap-2 text-xs font-semibold">
                      {(["collect", "paid", "void"] as const).map((op) => (
                        <form key={op} action={invoiceAction}><input type="hidden" name="invoiceId" value={i.id} /><input type="hidden" name="op" value={op} />
                          <button className={op === "void" ? "text-critical" : "text-primary"}>{op === "collect" ? "Charge" : op === "paid" ? "Mark paid" : "Void"}</button></form>
                      ))}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
