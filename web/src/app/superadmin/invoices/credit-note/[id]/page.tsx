import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireSuperadmin } from "@/lib/auth";
import { PrintButton } from "@/components/admin/PrintButton";
import { CreditNoteDoc } from "@/components/billing/CreditNoteDoc";
import { getPlatformIdentity } from "@/server/platform-identity";

export const metadata = { title: "Credit note" };
export const dynamic = "force-dynamic";

/** Printable credit note. SaaS (platform) notes use the platform identity; shop order notes use the shop. */
export default async function SuperadminCreditNotePage({ params }: { params: Promise<{ id: string }> }) {
  await requireSuperadmin();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const note = await db.query.creditNotes.findFirst({ where: eq(schema.creditNotes.id, id) });
  if (!note) notFound();
  const tenant = note.tenantId ? await db.query.tenants.findFirst({ where: eq(schema.tenants.id, note.tenantId) }) : null;
  const platform = note.scope === "platform";
  const identity = await getPlatformIdentity();
  const issuer = platform
    ? { name: identity.legalName || "QuickPrint UAE", lines: [identity.address, identity.email].filter(Boolean), trn: identity.vatRegistered ? identity.trn : null, taxDoc: identity.vatRegistered && !!identity.trn }
    : { name: tenant?.legalName || tenant?.name || "Shop", lines: [tenant?.address ?? "", tenant?.email ?? ""].filter(Boolean), trn: tenant?.trn ?? null, taxDoc: !!tenant?.trn };
  const billTo = platform
    ? { name: tenant?.legalName || tenant?.name || "", lines: [tenant?.trn ? `TRN: ${tenant.trn}` : ""].filter(Boolean) }
    : { name: "Customer", lines: [`Order ${note.refersTo}`] };
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex justify-between print:hidden">
        <a href="/superadmin/invoices" className="text-sm text-on-surface-variant hover:underline">← All invoices</a>
        <PrintButton />
      </div>
      <CreditNoteDoc note={note} issuer={issuer} billTo={billTo} />
    </div>
  );
}
