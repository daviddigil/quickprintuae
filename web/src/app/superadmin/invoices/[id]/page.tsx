import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireSuperadmin } from "@/lib/auth";
import { PrintButton } from "@/components/admin/PrintButton";
import { SaasInvoiceDoc } from "@/components/billing/SaasInvoiceDoc";
import { getPlatformIdentity } from "@/server/platform-identity";
import { creditNotesForInvoice } from "@/server/credit-notes";

export const metadata = { title: "SaaS invoice" };
export const dynamic = "force-dynamic";

export default async function SaasInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  await requireSuperadmin();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const invoice = await db.query.saasInvoices.findFirst({ where: eq(schema.saasInvoices.id, id) });
  if (!invoice) notFound();
  const tenant = await db.query.tenants.findFirst({ where: eq(schema.tenants.id, invoice.tenantId) });
  if (!tenant) notFound();
  const [identity, notes] = await Promise.all([getPlatformIdentity(), creditNotesForInvoice(invoice.id)]);
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex justify-between print:hidden">
        <Link href="/superadmin/invoices" className="text-sm text-on-surface-variant hover:underline">← All invoices</Link>
        <PrintButton />
      </div>
      <SaasInvoiceDoc invoice={invoice} tenant={tenant} identity={identity} creditNotes={notes} creditNoteHref={(c) => `/superadmin/invoices/credit-note/${c}`} />
    </div>
  );
}
