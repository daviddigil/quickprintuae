import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireStaff } from "@/lib/auth";
import { PrintButton } from "@/components/admin/PrintButton";
import { CreditNoteDoc } from "@/components/billing/CreditNoteDoc";
import { getPlatformIdentity } from "@/server/platform-identity";

export const metadata = { title: "Credit note" };
export const dynamic = "force-dynamic";

export default async function ShopSaasCreditNotePage({ params }: { params: Promise<{ id: string; cn: string }> }) {
  const { tenant } = await requireStaff();
  const { id, cn } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id) || !/^[0-9a-f-]{36}$/i.test(cn)) notFound();
  const note = await db.query.creditNotes.findFirst({ where: and(eq(schema.creditNotes.id, cn), eq(schema.creditNotes.saasInvoiceId, id), eq(schema.creditNotes.tenantId, tenant.id)) });
  if (!note) notFound();
  const identity = await getPlatformIdentity();
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex justify-between print:hidden">
        <a href={`/admin/billing/invoice/${id}`} className="text-sm text-on-surface-variant hover:underline">← Invoice</a>
        <PrintButton />
      </div>
      <CreditNoteDoc note={note}
        issuer={{ name: identity.legalName || "QuickPrint UAE", lines: [identity.address, identity.email].filter(Boolean), trn: identity.vatRegistered ? identity.trn : null, taxDoc: identity.vatRegistered && !!identity.trn }}
        billTo={{ name: tenant.legalName || tenant.name, lines: [tenant.trn ? `TRN: ${tenant.trn}` : ""].filter(Boolean) }} />
    </div>
  );
}
