import { Download } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { Alert, Badge, Card, CardHeader, EmptyState, LinkButton, Stat, Table } from "@/components/ui";
import { PageHeader } from "@/components/admin/PageHeader";
import { Flash } from "@/components/admin/Flash";
import { fmtDate } from "@/components/platform/PageTitle";
import { formatAED } from "@/lib/pricing";
import { shopStatement } from "@/server/payouts/statement";
import { PayoutAccountPanel } from "./PayoutAccountPanel";

export const metadata = { title: "Payouts" };
export const dynamic = "force-dynamic";

const KIND: Record<string, string> = { sale: "Sale", refund: "Refund", chargeback: "Dispute", chargeback_won: "Dispute won", chargeback_lost: "Dispute lost" };
const STATUS_TONE: Record<string, "gray" | "yellow" | "blue" | "green" | "red"> = { pending: "yellow", available: "blue", batched: "blue", paid: "green", refunded: "gray", disputed: "red" };

export default async function PayoutsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { tenant, user } = await requireStaff();
  const sp = await searchParams;
  const owner = user.role === "owner";
  if (!owner) return <div className="space-y-6"><PageHeader title="Payouts" /><Alert tone="yellow">Only the store owner can see balances and payouts.</Alert></div>;
  const s = await shopStatement(tenant.id);
  const verified = tenant.verificationStatus === "verified";
  return (
    <div className="space-y-6">
      <PageHeader title="Payouts" subtitle="What QuickPrint owes you, and when it reaches your bank."
        action={<LinkButton href="/admin/payouts/statement" variant="outlined" data-testid="statement-csv"><Download className="h-4 w-4" aria-hidden />Download statement (CSV)</LinkButton>} />
      <Flash sp={sp} />
      {!verified && <Alert tone="yellow">Payouts start once QuickPrint has verified your trade licence. Your balance keeps building in the meantime.</Alert>}
      {s.balance.negative < 0 && <Alert tone="blue">Refunds and disputes of {formatAED(-s.balance.negative)} are deducted from your balance and carried forward to the next payout.</Alert>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat tone="success" label="Available for next payout" value={<span data-testid="bal-available">{formatAED(s.balance.available)}</span>} sub="paid in the next payout batch" />
        <Stat label="Pending" value={<span data-testid="bal-pending">{formatAED(s.balance.pending)}</span>} sub="held before it becomes available" />
        <Stat label="In a payout batch" value={formatAED(s.balance.batched)} sub="approved, waiting for the bank transfer" />
        <Stat label="Paid out so far" value={<span data-testid="bal-paid">{formatAED(s.balance.paid)}</span>} />
      </div>
      <PayoutAccountPanel tenant={tenant} account={s.account} owner={owner} returnTo="/admin/payouts" />
      <Card>
        <CardHeader title="Per-order breakdown" subtitle="Gross is what the customer paid. The gateway fee and QuickPrint commission are deducted to give your net." />
        {s.lines.length === 0 ? <EmptyState title="No paid orders yet">Paid orders appear here with their fees and your net amount.</EmptyState> : (
          <Table head={["Order", "Type", "Gross", "Gateway fee", "Commission", "Net to you", "Status", "Available from"]}>
            {s.lines.map((l) => (
              <tr key={l.id} data-testid="statement-row">
                <td className="px-4 py-3 font-medium">{l.orderNumber}</td>
                <td className="px-4 py-3">{KIND[l.kind] ?? l.kind}</td>
                <td className="px-4 py-3">{formatAED(l.gross)}</td>
                <td className="px-4 py-3">{l.gatewayFee ? `−${formatAED(l.gatewayFee)}` : "—"}</td>
                <td className="px-4 py-3">{l.commission ? (l.commission < 0 ? formatAED(-l.commission) : `−${formatAED(l.commission)}`) : "—"}</td>
                <td className={`px-4 py-3 font-semibold ${l.net < 0 ? "text-critical" : ""}`} data-testid="row-net">{formatAED(l.net)}</td>
                <td className="px-4 py-3"><Badge tone={STATUS_TONE[l.status] ?? "gray"}>{l.status}</Badge></td>
                <td className="px-4 py-3">{fmtDate(l.availableAt)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      <Card>
        <CardHeader title="Payout history" />
        {s.history.length === 0 ? <EmptyState title="No payouts yet">Your first payout appears here once QuickPrint has sent it.</EmptyState> : (
          <Table head={["Batch", "Amount", "Status", "Bank reference", "Date"]}>
            {s.history.map(({ item, batch }) => (
              <tr key={item.id} data-testid="payout-history-row">
                <td className="px-4 py-3 font-medium">{batch.number}</td>
                <td className="px-4 py-3 font-semibold">{formatAED(item.amount)}</td>
                <td className="px-4 py-3"><Badge tone={batch.status === "paid" ? "green" : "blue"}>{batch.status === "paid" ? "Paid" : "On its way"}</Badge></td>
                <td className="px-4 py-3 font-mono text-xs">{batch.bankReference ?? "—"}</td>
                <td className="px-4 py-3">{fmtDate(batch.paidAt ?? batch.approvedAt)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
