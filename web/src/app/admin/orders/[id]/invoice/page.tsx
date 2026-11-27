import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireStaff } from "@/lib/auth";
import { formatAED, round2 } from "@/lib/pricing";
import { PrintButton } from "@/components/admin/PrintButton";
import { dubai, slotLabel } from "@/components/admin/format";
import { PoweredBy } from "@/components/PoweredBy";
import { getSellerIdentity } from "@/server/seller-identity";
import { creditNotesForOrder } from "@/server/credit-notes";

export const metadata = { title: "Invoice" };

export default async function InvoicePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ticket?: string }> }) {
  const { tenant } = await requireStaff();
  const { id } = await params;
  const ticket = (await searchParams).ticket === "1";
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const order = await db.query.orders.findFirst({ where: and(eq(schema.orders.id, id), eq(schema.orders.tenantId, tenant.id)) });
  if (!order) notFound();
  const items = await db.query.orderItems.findMany({ where: eq(schema.orderItems.orderId, order.id) });
  const pickup = order.pickupLocationId ? await db.query.pickupLocations.findFirst({ where: eq(schema.pickupLocations.id, order.pickupLocationId) }) : null;
  const vatRate = tenant.settings.vatRate ?? 5;
  const incl = tenant.settings.pricesIncludeVat;
  const taxable = round2(order.total - order.vat);
  const seller = await getSellerIdentity(tenant);
  const credits = await creditNotesForOrder(tenant.id, order.id);
  // the verified TRN wins; the owner-entered TRN is only a fallback so existing VAT invoices keep working
  const trn = seller?.trn ?? tenant.trn;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex justify-between print:hidden">
        <a href={`/admin/orders/${order.id}`} className="text-sm text-on-surface-variant hover:underline">← Back to order</a>
        <PrintButton />
      </div>
      <div className="rounded-xl border bg-white p-8 text-sm shadow-sm print:border-0 print:p-0 print:shadow-none">
        <div className="flex items-start justify-between gap-6 border-b pb-6">
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {tenant.logoUrl && <img src={tenant.logoUrl} alt="" className="mb-2 h-12" />}
            <p className="text-lg font-bold" data-testid="invoice-shop-name">{seller?.tradeName || tenant.legalName || tenant.name}</p>
            {seller && <p className="text-xs text-on-surface-variant" data-testid="invoice-sold-by">Sold by {seller.tradeName} · Shop: {tenant.name}</p>}
            {seller && <p className="text-on-surface-variant" data-testid="invoice-licence">Trade licence no. {seller.licenceNumber} ({seller.authority})</p>}
            <p className="text-on-surface-variant">{tenant.address}{tenant.address ? ", " : ""}{tenant.emirate}, United Arab Emirates</p>
            {tenant.phone && <p className="text-on-surface-variant">{tenant.phone}</p>}
            {tenant.email && <p className="text-on-surface-variant">{tenant.email}</p>}
            {trn && <p className="mt-1 font-semibold">TRN: {trn}</p>}
          </div>
          <div className="text-right">
            <p className="text-2xl font-extrabold uppercase tracking-wide">{ticket ? "Job Ticket" : trn ? "Tax Invoice" : "Invoice"}</p>
            <p className="mt-2"><span className="text-on-surface-variant">{ticket ? "Order" : "Invoice"} no.</span> <b>{order.number}</b></p>
            <p><span className="text-on-surface-variant">Date:</span> {dubai(order.paidAt ?? order.createdAt, "d MMM yyyy")}</p>
            <p><span className="text-on-surface-variant">Status:</span> {order.paidAt ? "Paid" : "Unpaid"}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6 border-b py-6">
          <div>
            <p className="text-xs font-semibold uppercase text-on-surface-variant">Bill to</p>
            <p className="font-medium">{order.customerName}</p>
            <p>{order.customerPhone}</p><p>{order.customerEmail}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-on-surface-variant">{order.fulfillment === "delivery" ? "Deliver to" : "Pickup at"}</p>
            {order.fulfillment === "delivery" && order.deliveryAddress ? (
              <p>{order.deliveryAddress.line1}{order.deliveryAddress.line2 ? `, ${order.deliveryAddress.line2}` : ""}<br />{order.deliveryAddress.area}, {order.deliveryAddress.city}, {order.deliveryAddress.emirate}</p>
            ) : <p>{pickup?.name}<br />{pickup?.address}</p>}
            <p className="mt-1">Slot: {slotLabel(order.slotStart, order.slotEnd)}</p>
          </div>
        </div>

        <table className="mt-6 w-full">
          <thead className="border-b text-left text-xs uppercase text-on-surface-variant">
            <tr><th className="py-2">Description</th><th className="py-2 text-right">Qty</th>{!ticket && <><th className="py-2 text-right">Unit (AED)</th><th className="py-2 text-right">Amount (AED)</th></>}</tr>
          </thead>
          <tbody className="divide-y">
            {items.map((it) => (
              <tr key={it.id} className="align-top">
                <td className="py-3">
                  <p className="font-medium">{it.productName}</p>
                  <p className="text-xs text-on-surface-variant">{Object.values(it.selectionLabels).join(" · ")}</p>
                  {ticket && it.fileIds.length > 0 && <p className="text-xs">Files: {it.fileIds.length}</p>}
                </td>
                <td className="py-3 text-right">{it.quantity}{it.pages > 1 ? ` × ${it.pages}p` : ""}</td>
                {!ticket && <><td className="py-3 text-right">{it.unitPrice.toFixed(2)}</td><td className="py-3 text-right">{it.lineTotal.toFixed(2)}</td></>}
              </tr>
            ))}
          </tbody>
        </table>

        {!ticket ? (
          <div className="ml-auto mt-6 w-full max-w-xs space-y-1">
            <Line k="Subtotal" v={formatAED(order.subtotal)} />
            {order.discount > 0 && <Line k="Discount" v={`−${formatAED(order.discount)}`} />}
            <Line k="Delivery" v={formatAED(order.deliveryFee)} />
            <Line k={`Taxable amount${incl ? " (excl. VAT)" : ""}`} v={formatAED(taxable)} />
            <Line k={`VAT ${vatRate}%`} v={formatAED(order.vat)} />
            <Line k="Total (AED)" v={formatAED(order.total)} bold />
          </div>
        ) : (
          <div className="mt-6 space-y-2">
            {order.notes && <p><b>Customer note:</b> {order.notes}</p>}
            {order.internalNotes && <p><b>Internal:</b> {order.internalNotes}</p>}
            <div className="mt-8 grid grid-cols-3 gap-4 text-xs text-on-surface-variant">
              {["Printed by", "Checked by", "Handed over"].map((l) => <div key={l} className="border-t pt-1">{l}</div>)}
            </div>
          </div>
        )}
        {!ticket && credits.length > 0 && (
          <p className="mt-6 text-sm print:hidden" data-testid="order-credit-notes">
            Credit note{credits.length > 1 ? "s" : ""}: {credits.map((c) => c.number).join(", ")} · <a className="underline" href={`/admin/orders/${order.id}/invoice/credit-note`}>View / print</a>
          </p>
        )}
        {!ticket && <p className="mt-10 text-center text-xs text-outline">Thank you for your business. This is a computer-generated document.</p>}
        <PoweredBy className="mt-2 text-center" />
      </div>
    </div>
  );
}
function Line({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
  return <div className={`flex justify-between ${bold ? "border-t pt-2 text-base font-bold" : ""}`}><span>{k}</span><span>{v}</span></div>;
}
