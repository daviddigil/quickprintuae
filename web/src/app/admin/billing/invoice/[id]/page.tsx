import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireStaff } from "@/lib/auth";
import { PrintButton } from "@/components/admin/PrintButton";
import { SaasInvoiceDoc } from "@/components/billing/SaasInvoiceDoc";
import { getPlatformIdentity } from "@/server/platform-identity";
import { creditNotesForInvoice } from "@/server/credit-notes";

export const metadata = { title: "QuickPrint invoice" };
export const dynamic = "force-dynamic";

/** The shop's view of an invoice QuickPrint issued to it. Scoped to the signed-in shop. */
export default async function ShopSaasInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { tenant } = await requireStaff();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const invoice = await db.query.saasInvoices.findFirst({ where: and(eq(schema.saasInvoices.id, id), eq(schema.saasInvoices.tenantId, tenant.id)) });
  if (!invoice) notFound();
  const [identity, notes] = await Promise.all([getPlatformIdentity(), creditNotesForInvoice(invoice.id)]);
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex justify-between print:hidden">
        <a href="/admin/billing" className="text-sm text-on-surface-variant hover:underline">← Plan &amp; billing</a>
        <PrintButton />
      </div>
      <SaasInvoiceDoc invoice={invoice} tenant={tenant} identity={identity} creditNotes={notes} creditNoteHref={(c) => `/admin/billing/invoice/${invoice.id}/credit-note/${c}`} />
    </div>
  );
}
