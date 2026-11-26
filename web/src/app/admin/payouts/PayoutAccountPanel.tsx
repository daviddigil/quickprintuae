import { Landmark } from "lucide-react";
import type { PayoutAccount, Tenant } from "@/db/schema";
import { Alert, Badge, Button, Card, CardHeader, Field, Input, Select } from "@/components/ui";
import { UAE_BANKS } from "@/lib/trust/iban";
import { fmtDateTime } from "@/components/platform/PageTitle";
import { savePayoutAccountAction } from "./actions";

const TONE = { pending_review: "yellow", verified: "green", rejected: "red" } as const;
const LABEL = { pending_review: "Waiting for review", verified: "Approved", rejected: "Rejected" } as const;

/** Payout bank details form (owner) + status. IBAN and account number are never shown again after saving: only the last 4 digits. */
export function PayoutAccountPanel({ tenant, account, owner, returnTo }: { tenant: Tenant; account?: PayoutAccount | null; owner: boolean; returnTo: "/admin/payouts" | "/admin/payments" }) {
  const hold = tenant.payoutHoldUntil && tenant.payoutHoldUntil > new Date() ? tenant.payoutHoldUntil : null;
  const known = account && (UAE_BANKS as readonly string[]).includes(account.bankName);
  const other = UAE_BANKS[UAE_BANKS.length - 1];
  return (
    <section aria-labelledby="payout-account" className="space-y-4" data-testid="payout-account">
      {hold && (
        <Alert tone="yellow">
          <p data-testid="payout-hold" className="font-medium">Payouts are paused until {fmtDateTime(hold)}.</p>
          <p>You changed your bank details, so QuickPrint holds payouts for 48 hours to protect your money from account takeover. Your sales keep adding to your balance.</p>
        </Alert>
      )}
      <Card>
        <CardHeader
          title={<span id="payout-account" className="flex items-center gap-2"><Landmark className="h-5 w-5" aria-hidden />Payout bank account {account && <Badge tone={TONE[account.status as keyof typeof TONE] ?? "gray"} dot>{LABEL[account.status as keyof typeof LABEL] ?? account.status}</Badge>}</span>}
          subtitle="Where QuickPrint sends your earnings. UAE bank accounts only, in AED."
        />
        {account?.status === "rejected" && <div className="px-5 pt-4"><Alert tone="red">Your bank details were rejected{account.reason ? `: ${account.reason}` : ""}. Please enter them again.</Alert></div>}
        {account && (
          <dl className="grid gap-3 px-5 pt-4 text-sm sm:grid-cols-3" data-testid="payout-account-summary">
            <div><dt className="text-on-surface-variant">Account holder</dt><dd className="font-medium">{account.accountHolderName}</dd></div>
            <div><dt className="text-on-surface-variant">Bank</dt><dd className="font-medium">{account.bankName}</dd></div>
            <div><dt className="text-on-surface-variant">IBAN</dt><dd className="font-mono font-medium">AE•• •••• •••• •••• {account.ibanLast4}</dd></div>
          </dl>
        )}
        {!owner ? <p className="p-5 text-sm text-on-surface-variant">Only the store owner can change bank details.</p> : (
          <form action={savePayoutAccountAction} className="grid gap-4 p-5 md:grid-cols-2">
            <input type="hidden" name="returnTo" value={returnTo} />
            <Field label="Account holder name" hint="as shown at your bank"><Input name="holderName" required minLength={3} maxLength={120} defaultValue={account?.accountHolderName ?? tenant.legalName ?? ""} autoComplete="off" /></Field>
            <Field label="Bank">
              <Select name="bank" required defaultValue={account ? (known ? account.bankName : other) : ""}>
                <option value="" disabled>Choose your bank</option>
                {UAE_BANKS.map((b) => <option key={b} value={b}>{b}</option>)}
              </Select>
            </Field>
            <Field label="Bank name, if you chose Other"><Input name="otherBank" maxLength={80} defaultValue={account && !known ? account.bankName : ""} autoComplete="off" /></Field>
            <Field label="IBAN" hint={account ? "re-enter to change; never shown again" : "AE + 21 digits"}><Input name="iban" required inputMode="text" autoComplete="off" placeholder="AE07 0331 2345 6789 0123 456" spellCheck={false} className="font-mono" /></Field>
            <Field label="Account number" hint="optional"><Input name="accountNumber" inputMode="numeric" autoComplete="off" /></Field>
            <Field label="SWIFT / BIC" hint="optional"><Input name="swift" maxLength={11} autoComplete="off" className="uppercase" /></Field>
            <div className="md:col-span-2 grid gap-4 md:grid-cols-2 border-t border-outline-variant pt-4">
              <Field label="Your password" hint="required to save bank details"><Input name="password" type="password" required autoComplete="current-password" /></Field>
              <p className="self-end text-sm text-on-surface-variant">Saving sends the details to QuickPrint for review and pauses payouts for 48 hours.</p>
            </div>
            <div className="md:col-span-2"><Button data-testid="save-payout-account">{account ? "Change bank details" : "Save bank details"}</Button></div>
          </form>
        )}
      </Card>
    </section>
  );
}
