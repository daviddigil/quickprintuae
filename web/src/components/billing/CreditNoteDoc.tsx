import type { CreditNote } from "@/db/schema";
import { dubai } from "@/components/admin/format";
import { formatAED } from "@/lib/pricing";

export interface CreditNoteIssuer { name: string; lines: string[]; trn?: string | null; taxDoc: boolean }

/** Printable credit note. Issuer is the shop (order refunds) or the platform (SaaS invoices). */
export function CreditNoteDoc({ note: c, issuer, billTo }: { note: CreditNote; issuer: CreditNoteIssuer; billTo: { name: string; lines: string[] } }) {
  return (
    <div className="rounded-xl border bg-white p-8 text-sm shadow-sm print:border-0 print:p-0 print:shadow-none" data-testid="credit-note">
      <div className="flex items-start justify-between gap-6 border-b pb-6">
        <div>
          <p className="text-lg font-bold">{issuer.name}</p>
          {issuer.lines.map((l, i) => <p key={i} className="text-on-surface-variant">{l}</p>)}
          {issuer.trn && <p className="mt-1 font-semibold">TRN: {issuer.trn}</p>}
        </div>
        <div className="text-right">
          <p className="text-2xl font-extrabold uppercase tracking-wide">{issuer.taxDoc ? "Tax Credit Note" : "Credit Note"}</p>
          <p className="mt-2"><span className="text-on-surface-variant">Credit note no.</span> <b data-testid="credit-note-number">{c.number}</b></p>
          <p><span className="text-on-surface-variant">Date:</span> {dubai(c.issuedAt, "d MMM yyyy")}</p>
          <p><span className="text-on-surface-variant">Refers to:</span> {c.refersTo}</p>
        </div>
      </div>
      <div className="border-b py-6">
        <p className="text-xs font-semibold uppercase text-on-surface-variant">Credited to</p>
        <p className="font-medium">{billTo.name}</p>
        {billTo.lines.map((l, i) => <p key={i}>{l}</p>)}
        {c.reason && <p className="mt-2 text-on-surface-variant">Reason: {c.reason}</p>}
      </div>
      <div className="ml-auto mt-6 w-full max-w-xs space-y-1">
        <div className="flex justify-between"><span>Credited excl. VAT</span><span>−{formatAED(c.subtotal)}</span></div>
        <div className="flex justify-between"><span>VAT</span><span>−{formatAED(c.vat)}</span></div>
        <div className="flex justify-between border-t pt-2 text-base font-bold"><span>Total credited ({c.currency})</span><span>−{formatAED(c.total)}</span></div>
      </div>
      <p className="mt-10 text-center text-xs text-outline">This is a computer-generated document.</p>
    </div>
  );
}
