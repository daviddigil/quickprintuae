import { ShieldCheck } from "lucide-react";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireStaff } from "@/lib/auth";
import { Alert, Card, LinkButton } from "@/components/ui";
import { PageHeader } from "@/components/admin/PageHeader";
import { Flash } from "@/components/admin/Flash";
import { PayoutAccountPanel } from "../payouts/PayoutAccountPanel";

export const metadata = { title: "Payments" };
export const dynamic = "force-dynamic";

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { tenant, user } = await requireStaff();
  const sp = await searchParams;
  const account = await db.query.payoutAccounts.findFirst({ where: eq(schema.payoutAccounts.tenantId, tenant.id) });
  return (
    <div className="space-y-6">
      <PageHeader title="Payments" subtitle="Customers pay online with card, Apple Pay or Google Pay. You do not need a payment account of your own." />
      <Flash sp={sp} />
      <Card className="p-5" data-testid="payments-handled">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-6 w-6 shrink-0 text-success" aria-hidden />
          <div>
            <h2 className="font-semibold">Payments are handled by QuickPrint</h2>
            <p className="mt-1 text-sm text-on-surface-variant measure">QuickPrint collects every customer payment, takes its commission and the card processing fee, then pays the rest to your bank account in payout batches. There are no payment keys to enter. Orders go to production only after the online payment succeeds.</p>
            <div className="mt-3"><LinkButton href="/admin/payouts" variant="tonal">See my balance and payouts</LinkButton></div>
          </div>
        </div>
      </Card>
      {tenant.verificationStatus !== "verified" && <Alert tone="yellow">Your business is not verified yet, so live customer payments and payouts are switched off until QuickPrint approves your trade licence.</Alert>}
      <PayoutAccountPanel tenant={tenant} account={account} owner={user.role === "owner"} returnTo="/admin/payments" />
    </div>
  );
}
