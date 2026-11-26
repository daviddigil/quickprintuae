import Link from "next/link";
import { desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireSuperadmin } from "@/lib/auth";
import { Alert, Badge, Button, Card, CardHeader, EmptyState, Input, Stat, Table } from "@/components/ui";
import { PageTitle, fmtDate, fmtDateTime } from "@/components/platform/PageTitle";
import { Flash } from "@/components/admin/Flash";
import { formatAED } from "@/lib/pricing";
import { nameSimilarity, normaliseBusinessName, SIMILAR_NAME_THRESHOLD } from "@/lib/trust/normalise";
import { backfillSettlements, balances } from "@/server/payouts/ledger";
import { SKIP_LABELS, listBatches, previewBatch, reconciliation, MIN_PAYOUT_AED } from "@/server/payouts/batches";
import { createBatchAction, reviewAccountAction } from "./actions";
import { RevealIban } from "./RevealIban";

export const dynamic = "force-dynamic";
export const metadata = { title: "Payouts" };

const BATCH_TONE = { draft: "yellow", approved: "blue", paid: "green", cancelled: "gray" } as const;

export default async function PayoutsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  await requireSuperadmin();
  const sp = await searchParams;
  await backfillSettlements(100).catch(() => 0);
  const [bal, plan, batches, recon, pending] = await Promise.all([
    (async () => { await previewBatch(); return balances(); })(), previewBatch(), listBatches(20), reconciliation(),
    db.query.payoutAccounts.findMany({ where: eq(schema.payoutAccounts.status, "pending_review"), orderBy: desc(schema.payoutAccounts.updatedAt) }),
  ]);
  const ids = [...new Set([...bal.keys(), ...pending.map((p) => p.tenantId), ...plan.skipped.map((s) => s.tenantId)])];
  const [tenants, verifs] = ids.length ? await Promise.all([
    db.query.tenants.findMany({ where: inArray(schema.tenants.id, ids) }),
    db.query.sellerVerifications.findMany({ where: inArray(schema.sellerVerifications.tenantId, ids) }),
  ]) : [[], []];
  const name = (id: string) => tenants.find((t) => t.id === id)?.name ?? id.slice(0, 8);
  const totals = [...bal.values()].reduce((a, b) => ({ pending: a.pending + b.pending, available: a.available + b.available, batched: a.batched + b.batched, paid: a.paid + b.paid, negative: a.negative + b.negative }), { pending: 0, available: 0, batched: 0, paid: 0, negative: 0 });
  return (
    <div className="space-y-6">
      <PageTitle title="Payouts" subtitle="Money collected by the platform, owed to shops, and paid out in batches." />
      <Flash sp={sp} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Pending (held)" value={formatAED(totals.pending)} />
        <Stat tone="success" label="Available" value={<span data-testid="sa-available">{formatAED(totals.available)}</span>} />
        <Stat label="In batches" value={formatAED(totals.batched)} />
        <Stat label="Paid out" value={formatAED(totals.paid)} />
        <Stat tone="critical" label="Owed back (negative)" value={formatAED(totals.negative)} sub="refunds, disputes" />
      </div>

      <Card data-testid="account-queue">
        <CardHeader title={`Payout accounts to review (${pending.length})`} subtitle="Approve only after checking the holder matches the licensed business. IBANs are masked; revealing one is audited." />
        {pending.length === 0 ? <EmptyState title="No bank accounts waiting for review" /> : (
          <ul className="divide-y divide-outline-variant">
            {pending.map((a) => {
              const t = tenants.find((x) => x.id === a.tenantId), v = verifs.find((x) => x.tenantId === a.tenantId);
              const sim = v ? nameSimilarity(normaliseBusinessName(a.accountHolderName), normaliseBusinessName(v.legalName)) : null;
              return (
                <li key={a.id} className="grid gap-3 p-5 lg:grid-cols-[1fr_auto]" data-testid="account-row">
                  <div className="space-y-1 text-sm">
                    <p className="font-semibold">{t?.name} <Badge tone={t?.verificationStatus === "verified" ? "green" : "yellow"}>{t?.verificationStatus === "verified" ? "seller verified" : `seller ${t?.verificationStatus}`}</Badge></p>
                    <p>{a.accountHolderName} · {a.bankName} · <span className="font-mono">AE•• •••• •••• •••• {a.ibanLast4}</span> <RevealIban accountId={a.id} /></p>
                    {v && <p className="text-on-surface-variant">Licensed name: {v.legalName} {sim !== null && sim < SIMILAR_NAME_THRESHOLD && <Badge tone="yellow">holder name differs</Badge>}</p>}
                    <p className="text-on-surface-variant">Submitted {fmtDateTime(a.updatedAt)} · {(a.history ?? []).at(-1)?.note}</p>
                  </div>
                  <div className="flex flex-col gap-2">
                    <form action={reviewAccountAction}><input type="hidden" name="accountId" value={a.id} /><input type="hidden" name="decision" value="approve" /><Button data-testid="approve-account">Approve account</Button></form>
                    <form action={reviewAccountAction} className="flex gap-2"><input type="hidden" name="accountId" value={a.id} /><input type="hidden" name="decision" value="reject" />
                      <Input name="reason" required placeholder="Reason" aria-label="Rejection reason" /><Button variant="outlined">Reject</Button></form>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card data-testid="batch-plan">
        <CardHeader title="Next payout batch" subtitle={`Included: shops that are verified, with an approved bank account, no 48 h bank-change hold, no open dispute, and at least AED ${MIN_PAYOUT_AED} available.`}
          action={plan.lines.length > 0 && <form action={createBatchAction}><Button data-testid="create-batch">Create draft batch</Button></form>} />
        {plan.lines.length === 0 && plan.skipped.length === 0 ? <EmptyState title="Nothing available to pay yet" /> : (
          <div className="grid gap-0 lg:grid-cols-2">
            <div>
              <h4 className="px-5 pt-4 text-sm font-semibold">Will be paid ({plan.lines.length})</h4>
              {plan.lines.length === 0 ? <p className="px-5 py-3 text-sm text-on-surface-variant">Nobody is payable right now.</p> : (
                <Table head={["Shop", "Amount", "Carried forward"]}>{plan.lines.map((l) => (
                  <tr key={l.tenantId} data-testid="plan-line"><td className="px-4 py-3 font-medium">{name(l.tenantId)}</td><td className="px-4 py-3 font-semibold">{formatAED(l.amount)}</td><td className="px-4 py-3">{l.carriedForward ? formatAED(l.carriedForward) : "—"}</td></tr>
                ))}</Table>
              )}
            </div>
            <div>
              <h4 className="px-5 pt-4 text-sm font-semibold">Skipped ({plan.skipped.filter((s) => s.reason !== "nothing_available").length})</h4>
              <Table head={["Shop", "Why"]}>{plan.skipped.filter((s) => s.reason !== "nothing_available").map((s) => (
                <tr key={s.tenantId} data-testid="plan-skip"><td className="px-4 py-3 font-medium">{name(s.tenantId)}</td><td className="px-4 py-3"><Badge tone="yellow">{SKIP_LABELS[s.reason]}</Badge></td></tr>
              ))}</Table>
            </div>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="Balances by shop" />
        {bal.size === 0 ? <EmptyState title="No ledger entries yet" /> : (
          <Table head={["Shop", "Pending", "Available", "In batch", "Paid", "Negative", "Hold until"]}>
            {[...bal.entries()].map(([tid, b]) => {
              const t = tenants.find((x) => x.id === tid);
              return (
                <tr key={tid} data-testid="balance-row"><td className="px-4 py-3 font-medium">{name(tid)}</td><td className="px-4 py-3">{formatAED(b.pending)}</td><td className="px-4 py-3">{formatAED(b.available)}</td>
                  <td className="px-4 py-3">{formatAED(b.batched)}</td><td className="px-4 py-3">{formatAED(b.paid)}</td><td className={`px-4 py-3 ${b.negative < 0 ? "text-critical" : ""}`}>{formatAED(b.negative)}</td>
                  <td className="px-4 py-3">{t?.payoutHoldUntil && t.payoutHoldUntil > new Date() ? fmtDateTime(t.payoutHoldUntil) : "—"}</td></tr>
              );
            })}
          </Table>
        )}
      </Card>

      <Card>
        <CardHeader title="Batches" />
        {batches.length === 0 ? <EmptyState title="No batches yet" /> : (
          <Table head={["Number", "Status", "Shops", "Total", "Created", "Bank reference"]}>
            {batches.map((b) => (
              <tr key={b.id} data-testid="batch-row"><td className="px-4 py-3 font-medium"><Link className="text-primary underline" href={`/superadmin/payouts/${b.id}`}>{b.number}</Link></td>
                <td className="px-4 py-3"><Badge tone={BATCH_TONE[b.status as keyof typeof BATCH_TONE] ?? "gray"}>{b.status}</Badge></td><td className="px-4 py-3">{b.itemCount}</td>
                <td className="px-4 py-3 font-semibold">{formatAED(b.totalAmount)}</td><td className="px-4 py-3">{fmtDate(b.createdAt)}</td><td className="px-4 py-3 font-mono text-xs">{b.bankReference ?? "—"}</td></tr>
            ))}
          </Table>
        )}
      </Card>

      <Card data-testid="reconciliation">
        <CardHeader title="Reconciliation" subtitle="What the gateways recorded as paid against what the ledger holds. Differences need a look before paying out." />
        {recon.ordersWithoutLedger > 0 && <div className="px-5 pt-4"><Alert tone="yellow">{recon.ordersWithoutLedger} paid order(s) have no ledger row yet. They are added automatically; refresh in a minute.</Alert></div>}
        {recon.rows.length === 0 ? <EmptyState title="No payments recorded yet" /> : (
          <Table head={["Gateway", "Gateway paid", "Ledger gross", "Difference", "Fees", "Commission", "Net owed", "Refunds/disputes"]}>
            {recon.rows.map((r) => (
              <tr key={r.provider} data-testid="recon-row"><td className="px-4 py-3 font-medium capitalize">{r.provider}</td><td className="px-4 py-3">{formatAED(r.gatewayTotal)} <span className="text-xs text-on-surface-variant">({r.gatewayCount})</span></td>
                <td className="px-4 py-3">{formatAED(r.ledgerGross)} <span className="text-xs text-on-surface-variant">({r.ledgerCount})</span></td>
                <td className="px-4 py-3">{r.diff === 0 ? <Badge tone="green">Matches</Badge> : <Badge tone="red">{formatAED(r.diff)}</Badge>}</td>
                <td className="px-4 py-3">{formatAED(r.fees)}</td><td className="px-4 py-3">{formatAED(r.commission)}</td><td className="px-4 py-3">{formatAED(r.net)}</td><td className="px-4 py-3">{formatAED(r.adjustments)}</td></tr>
            ))}
          </Table>
        )}
        <p className="px-5 py-3 text-xs text-on-surface-variant">Ledger by status: {recon.byStatus.map((s) => `${s.status} ${formatAED(s.net)}`).join(" · ") || "empty"}. Gateway figures come from QuickPrint&apos;s own record of successful payments; compare with the gateway dashboard when closing a month.</p>
      </Card>
    </div>
  );
}
