import Link from "next/link";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { requireSuperadmin } from "@/lib/auth";
import { Alert, Badge, Button, Card, CardHeader, Field, Input, LinkButton, Stat, Table } from "@/components/ui";
import { PageTitle, fmtDateTime } from "@/components/platform/PageTitle";
import { Flash } from "@/components/admin/Flash";
import { formatAED } from "@/lib/pricing";
import { batchDetail, superadminCount } from "@/server/payouts/batches";
import { approveBatchAction, cancelBatchAction, markPaidAction } from "../actions";
import { db, schema } from "@/db";
import { inArray } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Payout batch" };

export default async function BatchPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { user } = await requireSuperadmin();
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const d = await batchDetail(id);
  if (!d) notFound();
  const { batch, items } = d;
  const admins = await superadminCount();
  const users = await db.query.users.findMany({ where: inArray(schema.users.id, [batch.createdBy, batch.approvedBy, batch.paidBy].filter(Boolean) as string[]) });
  const who = (uid?: string | null) => users.find((u) => u.id === uid)?.name ?? "—";
  const sameUser = admins > 1 && batch.createdBy === user.id;
  return (
    <div className="space-y-6">
      <PageTitle title={`Batch ${batch.number}`} subtitle={`${batch.status} · ${items.length} shop(s)`} action={<Link href="/superadmin/payouts" className="text-sm text-primary underline">Back to payouts</Link>} />
      <Flash sp={sp} />
      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="Total" value={<span data-testid="batch-total">{formatAED(batch.totalAmount)}</span>} />
        <Stat label="Status" value={<span data-testid="batch-status">{batch.status}</span>} />
        <Stat label="Created by" value={who(batch.createdBy)} sub={fmtDateTime(batch.createdAt)} />
        <Stat label="Approved by" value={who(batch.approvedBy)} sub={batch.approvedAt ? fmtDateTime(batch.approvedAt) : undefined} />
      </div>
      <Card>
        <CardHeader title="Transfers" subtitle="IBANs are masked here. The CSV export decrypts them and is audited." action={batch.status !== "cancelled" && <LinkButton href={`/superadmin/payouts/${batch.id}/csv`} variant="outlined" data-testid="batch-csv"><Download className="h-4 w-4" aria-hidden />Bank transfer CSV</LinkButton>} />
        <Table head={["Shop", "Account holder", "Bank", "IBAN", "Amount", "Carried forward", "Orders", "Status"]}>
          {items.map((i) => (
            <tr key={i.id} data-testid="batch-item"><td className="px-4 py-3 font-medium">{i.tenant?.name}</td><td className="px-4 py-3">{i.bankSnapshot.accountHolderName}</td><td className="px-4 py-3">{i.bankSnapshot.bankName}</td>
              <td className="px-4 py-3 font-mono text-xs">{i.maskedIban}</td><td className="px-4 py-3 font-semibold">{formatAED(i.amount)}</td><td className="px-4 py-3">{i.carriedForward ? formatAED(i.carriedForward) : "—"}</td>
              <td className="px-4 py-3">{i.settlementIds.length}</td><td className="px-4 py-3"><Badge tone={i.status === "paid" ? "green" : "gray"}>{i.status}</Badge></td></tr>
          ))}
        </Table>
      </Card>
      {batch.status === "draft" && (
        <Card>
          <CardHeader title="Approve or cancel" subtitle={admins > 1 ? "A different superadmin than the creator must approve (maker-checker)." : "You are the only superadmin, so approving needs your password again."} />
          <div className="grid gap-4 p-5 md:grid-cols-2">
            <form action={approveBatchAction} className="space-y-3">
              <input type="hidden" name="batchId" value={batch.id} />
              {sameUser ? <Alert tone="yellow">You created this batch. Ask another superadmin to approve it.</Alert> : admins <= 1 && <Field label="Your password"><Input name="password" type="password" required autoComplete="current-password" /></Field>}
              <Button data-testid="approve-batch" disabled={sameUser}>Approve batch</Button>
            </form>
            <form action={cancelBatchAction} className="flex items-end"><input type="hidden" name="batchId" value={batch.id} /><Button variant="outlined" data-testid="cancel-batch">Cancel draft</Button></form>
          </div>
        </Card>
      )}
      {batch.status === "approved" && (
        <Card>
          <CardHeader title="Mark as paid" subtitle="Make the bank transfers from the CSV first, then enter the bank's batch reference. This cannot be undone." />
          <form action={markPaidAction} className="flex flex-wrap items-end gap-4 p-5">
            <input type="hidden" name="batchId" value={batch.id} />
            <Field label="Bank reference"><Input name="bankReference" required minLength={3} maxLength={80} data-testid="bank-reference" /></Field>
            <Button data-testid="mark-paid">Mark paid</Button>
          </form>
        </Card>
      )}
      {batch.status === "paid" && <Alert tone="green">Paid on {fmtDateTime(batch.paidAt)} by {who(batch.paidBy)}. Bank reference <span className="font-mono">{batch.bankReference}</span>. This batch is final.</Alert>}
    </div>
  );
}
