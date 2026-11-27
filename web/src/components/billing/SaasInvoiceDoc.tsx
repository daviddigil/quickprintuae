import type { CreditNote, SaasInvoice, Tenant } from "@/db/schema";
import type { PlatformIdentity } from "@/lib/platform-identity";
import { platformDocTitle } from "@/lib/platform-identity";
import { PlatformIdentityBlock } from "@/components/platform-identity-block";
import { dubai } from "@/components/admin/format";
import { formatAED } from "@/lib/pricing";

/** Printable SaaS invoice (issuer: the platform). Shared by the superadmin and the shop views. */
export function SaasInvoiceDoc({ invoice: i, tenant, identity, creditNotes, creditNoteHref }: {
  invoice: SaasInvoice; tenant: Pick<Tenant, "name" | "legalName" | "trn" | "address" | "emirate" | "email">; identity: PlatformIdentity;
  creditNotes: CreditNote[]; creditNoteHref: (id: string) => string;
}) {
  const net = i.total - i.vat;
  return (
    <div className="rounded-xl border bg-white p-8 text-sm shadow-sm print:border-0 print:p-0 print:shadow-none" data-testid="saas-invoice">
      <div className="flex items-start justify-between gap-6 border-b pb-6">
        <PlatformIdentityBlock identity={identity} />
        <div className="text-right">
          <p className="text-2xl font-extrabold uppercase tracking-wide">{platformDocTitle(identity, "invoice")}</p>
          <p className="mt-2"><span className="text-on-surface-variant">Invoice no.</span> <b>{i.number}</b></p>
          <p><span className="text-on-surface-variant">Date:</span> {dubai(i.createdAt, "d MMM yyyy")}</p>
          <p><span className="text-on-surface-variant">Status:</span> {i.status}</p>
        </div>
      </div>
      <div className="border-b py-6">
        <p className="text-xs font-semibold uppercase text-on-surface-variant">Bill to</p>
        <p className="font-medium">{tenant.legalName || tenant.name}</p>
        {tenant.address && <p>{tenant.address}{tenant.emirate ? `, ${tenant.emirate}` : ""}</p>}
        {tenant.email && <p>{tenant.email}</p>}
        {tenant.trn && <p>TRN: {tenant.trn}</p>}
        <p className="mt-1 text-on-surface-variant">Period: {dubai(i.periodStart, "d MMM yyyy")} – {dubai(i.periodEnd, "d MMM yyyy")}</p>
      </div>
      <table className="mt-6 w-full">
        <thead className="border-b text-left text-xs uppercase text-on-surface-variant"><tr><th className="py-2">Description</th><th className="py-2 text-right">Amount (AED)</th></tr></thead>
        <tbody className="divide-y">
          <tr><td className="py-2">Subscription</td><td className="py-2 text-right">{i.subscriptionAmount.toFixed(2)}</td></tr>
          {i.discountAmount > 0 && <tr><td className="py-2">Discount{i.discountDetail.length ? ` (${i.discountDetail.map((d) => d.name).join(", ")})` : ""}</td><td className="py-2 text-right">−{i.discountAmount.toFixed(2)}</td></tr>}
          {i.orderFeeAmount > 0 && <tr><td className="py-2">Order commission (GMV {formatAED(i.gmv)})</td><td className="py-2 text-right">{i.orderFeeAmount.toFixed(2)}</td></tr>}
          {i.usageDetail.map((u) => <tr key={u.kind}><td className="py-2">{u.label}: {u.billedQty} × {u.rate}</td><td className="py-2 text-right">{u.amount.toFixed(2)}</td></tr>)}
        </tbody>
      </table>
      <div className="ml-auto mt-6 w-full max-w-xs space-y-1">
        <div className="flex justify-between"><span>Total excl. VAT</span><span>{formatAED(net)}</span></div>
        <div className="flex justify-between"><span>VAT 5%</span><span>{formatAED(i.vat)}</span></div>
        <div className="flex justify-between border-t pt-2 text-base font-bold"><span>Total (AED)</span><span>{formatAED(i.total)}</span></div>
      </div>
      {creditNotes.length > 0 && (
        <div className="mt-8 border-t pt-4" data-testid="invoice-credit-notes">
          <p className="text-xs font-semibold uppercase text-on-surface-variant">Credit notes</p>
          <ul className="mt-1">{creditNotes.map((c) => <li key={c.id}><a className="underline" href={creditNoteHref(c.id)}>{c.number}</a> · {formatAED(c.total)} · {dubai(c.issuedAt, "d MMM yyyy")}</li>)}</ul>
        </div>
      )}
      <p className="mt-10 text-center text-xs text-outline">This is a computer-generated document.</p>
    </div>
  );
}
