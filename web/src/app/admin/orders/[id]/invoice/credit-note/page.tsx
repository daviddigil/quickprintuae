import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireStaff } from "@/lib/auth";
import { PrintButton } from "@/components/admin/PrintButton";
import { CreditNoteDoc } from "@/components/billing/CreditNoteDoc";
import { creditNotesForOrder } from "@/server/credit-notes";
import { getSellerIdentity } from "@/server/seller-identity";

export const metadata = { title: "Credit note" };
export const dynamic = "force-dynamic";

/** Printable credit note(s) the shop issued for a refunded order. */
export default async function OrderCreditNotePage({ params }: { params: Promise<{ id: string }> }) {
  const { tenant } = await requireStaff();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const order = await db.query.orders.findFirst({ where: and(eq(schema.orders.id, id), eq(schema.orders.tenantId, tenant.id)) });
  if (!order) notFound();
  const notes = await creditNotesForOrder(tenant.id, order.id);
  if (!notes.length) notFound();
  const seller = await getSellerIdentity(tenant);
  const issuer = {
    name: seller?.tradeName || tenant.legalName || tenant.name,
    lines: [seller ? `Trade licence no. ${seller.licenceNumber} (${seller.authority})` : "", seller?.address ?? tenant.address ?? "", tenant.email ?? ""].filter(Boolean),
    trn: seller?.trn ?? null, taxDoc: !!seller?.trn,
  };
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex justify-between print:hidden">
        <a href={`/admin/orders/${order.id}/invoice`} className="text-sm text-on-surface-variant hover:underline">← Invoice</a>
        <PrintButton />
      </div>
      {notes.map((n) => <CreditNoteDoc key={n.id} note={n} issuer={issuer} billTo={{ name: order.customerName, lines: [order.customerEmail, order.customerPhone].filter(Boolean) }} />)}
    </div>
  );
}
