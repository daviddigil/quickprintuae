import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, inArray } from "drizzle-orm";
import { MessageCircle, Printer, Lock, FileText } from "lucide-react";
import { db, schema } from "@/db";
import { requireStaff } from "@/lib/auth";
import { formatAED } from "@/lib/pricing";
import { ORDER_STATUS_LABEL } from "@/lib/types";
import { NEXT_STATUSES } from "@/server/orders";
import { DELIVERY_PROVIDERS } from "@/server/delivery";
import { Alert, Badge, Button, Card, CardHeader, Input, LinkButton, ORDER_STATUS_TONE, Select, Textarea } from "@/components/ui";
import { Flash } from "@/components/admin/Flash";
import { ProofDownload } from "@/components/admin/ProofDownload";
import { WalkInOrderJobs } from "@/components/admin/WalkInOrderJobs";
import { dubai, slotLabel, waLink } from "@/components/admin/format";
import { bookCourier, changeOrderStatus, saveInternalNotes, setManualTracking } from "../../actions";

const fmtSize = (b: number) => (b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.ceil(b / 1e3)} KB`);

export default async function OrderDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { tenant } = await requireStaff();
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const order = await db.query.orders.findFirst({ where: and(eq(schema.orders.id, id), eq(schema.orders.tenantId, tenant.id)) });
  if (!order) notFound();
  const items = await db.query.orderItems.findMany({ where: eq(schema.orderItems.orderId, order.id) });
  const fileIds = items.flatMap((i) => i.fileIds);
  const files = fileIds.length ? await db.query.files.findMany({ where: and(eq(schema.files.tenantId, tenant.id), inArray(schema.files.id, fileIds)) }) : [];
  const events = await db.query.orderEvents.findMany({ where: eq(schema.orderEvents.orderId, order.id), orderBy: [asc(schema.orderEvents.createdAt)] });
  const pickup = order.pickupLocationId ? await db.query.pickupLocations.findFirst({ where: eq(schema.pickupLocations.id, order.pickupLocationId) }) : null;
  const payments = await db.query.payments.findMany({ where: eq(schema.payments.orderId, order.id) });
  const printJobs = order.source === "walk_in" ? await db.query.printJobs.findMany({ where: and(eq(schema.printJobs.orderId, order.id), eq(schema.printJobs.tenantId, tenant.id)), orderBy: [asc(schema.printJobs.createdAt)] }) : [];
  const next = NEXT_STATUSES[order.status];
  const enabledProviders = DELIVERY_PROVIDERS.filter((p) => p.code === "inhouse" || p.code === "manual" || tenant.settings.delivery?.providers?.[p.code]?.enabled);
  const confidential = items.some((i) => i.kind === "confidential_document");
  const wa = waLink(order.customerPhone, `Hi ${order.customerName}, this is ${tenant.name} about your order ${order.number}.`);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/admin/orders" className="text-sm text-on-surface-variant hover:underline">← Orders</Link>
          <h1 className="mt-1 flex items-center gap-3 text-2xl font-bold">{order.number} <Badge tone={ORDER_STATUS_TONE[order.status]}>{ORDER_STATUS_LABEL[order.status]}</Badge>
            {confidential && <Badge tone="red"><Lock size={12} className="mr-1" />Confidential</Badge>}
            {order.source === "walk_in" && <Badge tone="purple">Walk-in {order.ticketNo}</Badge>}</h1>
          <p className="text-sm text-on-surface-variant">Placed {dubai(order.createdAt)} · {order.fulfillment === "delivery" ? "Delivery" : "Pickup"} · {slotLabel(order.slotStart, order.slotEnd)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={wa} target="_blank" className="inline-flex items-center gap-2 rounded-lg bg-success px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"><MessageCircle size={16} />WhatsApp</a>
          <LinkButton variant="secondary" href={`/admin/orders/${order.id}/invoice`}><FileText size={16} />Tax invoice</LinkButton>
          <LinkButton variant="secondary" href={`/admin/orders/${order.id}/invoice?ticket=1`}><Printer size={16} />Job ticket</LinkButton>
        </div>
      </div>
      <Flash sp={sp} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {printJobs.length > 0 && <WalkInOrderJobs ticketNo={order.ticketNo} jobs={printJobs.map((j) => ({ id: j.id, filename: j.filename, fileId: j.fileId, status: j.status, priority: j.priority, pages: j.pages, copies: j.copies, pagesVerified: j.pagesVerified, options: j.options, attempts: j.attempts, error: j.error, printerName: j.printerName }))} />}
          <Card>
            <CardHeader title="Items" />
            <div className="divide-y">
              {items.map((it) => {
                const itemFiles = files.filter((f) => it.fileIds.includes(f.id));
                return (
                  <div key={it.id} className="space-y-3 px-5 py-4">
                    <div className="flex flex-wrap justify-between gap-2">
                      <div>
                        <p className="font-semibold">{it.productName}</p>
                        <p className="text-sm text-on-surface-variant">Qty {it.quantity}{it.pages > 1 ? ` × ${it.pages} pages` : ""} · {formatAED(it.unitPrice)} / unit</p>
                      </div>
                      <p className="font-semibold">{formatAED(it.lineTotal)}</p>
                    </div>
                    {Object.keys(it.selectionLabels).length > 0 && (
                      <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                        {Object.entries(it.selectionLabels).map(([k, v]) => (
                          <div key={k} className="flex gap-2"><dt className="capitalize text-on-surface-variant">{k.replace(/_/g, " ")}:</dt><dd className="font-medium">{v}</dd></div>
                        ))}
                      </dl>
                    )}
                    {itemFiles.length > 0 && (
                      <ul className="space-y-1">
                        {itemFiles.map((f) => (
                          <li key={f.id} className="flex flex-wrap items-center gap-2 text-sm">
                            {f.confidential && <Lock size={14} className="text-critical" />}
                            {f.deletedAt ? (
                              <span className="text-outline line-through">{f.filename}</span>
                            ) : (
                              <a className="font-medium text-primary hover:underline" href={`/api/v1/admin/files/${f.id}`}>{f.filename}</a>
                            )}
                            <span className="text-xs text-outline">{fmtSize(f.size)}{f.pageCount ? ` · ${f.pageCount} pages` : ""}{f.widthPx ? ` · ${f.widthPx}×${f.heightPx}px` : ""}</span>
                            {f.deletedAt && <Badge>purged {dubai(f.deletedAt, "d MMM")}</Badge>}
                            {!f.deletedAt && f.deleteAfter && <Badge tone="yellow">auto-delete {dubai(f.deleteAfter, "d MMM HH:mm")}</Badge>}
                          </li>
                        ))}
                      </ul>
                    )}
                    {it.design && <ProofDownload design={it.design} name={`${order.number}-${it.id.slice(0, 6)}`} />}
                  </div>
                );
              })}
            </div>
            <div className="space-y-1 border-t bg-surface-low px-5 py-4 text-sm">
              <Row k="Subtotal" v={formatAED(order.subtotal)} />
              {order.discount > 0 && <Row k="Discount" v={`−${formatAED(order.discount)}`} />}
              <Row k="Delivery" v={formatAED(order.deliveryFee)} />
              <Row k={`VAT (${tenant.settings.vatRate ?? 5}%)`} v={formatAED(order.vat)} />
              <Row k="Total" v={formatAED(order.total)} bold />
              <p className="pt-1 text-xs text-on-surface-variant">
                {order.paidAt ? `Paid ${dubai(order.paidAt)} via ${order.paymentProvider}` : "Not paid yet"}
                {payments.length > 0 && ` · refs: ${payments.map((p) => `${p.provider}:${p.providerRef} (${p.status})`).join(", ")}`}
              </p>
            </div>
          </Card>

          <Card>
            <CardHeader title="Timeline" />
            <ol className="space-y-3 px-5 py-4 text-sm">
              {events.map((e) => (
                <li key={e.id} className="flex gap-3">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-outline" />
                  <div><span className="font-medium">{ORDER_STATUS_LABEL[e.status as keyof typeof ORDER_STATUS_LABEL] ?? e.status.replace(/_/g, " ")}</span>
                    {e.message && <span className="text-on-surface-variant"> — {e.message}</span>}
                    <div className="text-xs text-outline">{dubai(e.createdAt)}</div></div>
                </li>
              ))}
              {events.length === 0 && <li className="text-on-surface-variant">No events yet.</li>}
            </ol>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Update status" />
            <div className="space-y-3 p-5">
              {next.length === 0 ? <p className="text-sm text-on-surface-variant">This order is closed.</p> : (
                <form action={changeOrderStatus} className="space-y-3">
                  <input type="hidden" name="orderId" value={order.id} />
                  <Input name="message" placeholder="Optional note for the timeline" />
                  <div className="flex flex-wrap gap-2">
                    {next.map((s) => (
                      <Button key={s} name="status" value={s} variant={s === "cancelled" || s === "refunded" ? "secondary" : "primary"} className="text-xs">→ {ORDER_STATUS_LABEL[s]}</Button>
                    ))}
                  </div>
                </form>
              )}
              {order.status === "pending_payment" && <p className="text-xs text-on-surface-variant">Orders move to Paid automatically when Stripe / Mamo Pay confirms the payment.</p>}
            </div>
          </Card>

          <Card>
            <CardHeader title="Customer" />
            <div className="space-y-1 p-5 text-sm">
              <p className="font-medium">{order.customerName}</p>
              <p><a className="text-primary" href={`tel:${order.customerPhone}`}>{order.customerPhone}</a></p>
              <p><a className="text-primary" href={`mailto:${order.customerEmail}`}>{order.customerEmail}</a></p>
              {order.notes && <Alert tone="yellow">Customer note: {order.notes}</Alert>}
            </div>
          </Card>

          <Card>
            <CardHeader title={order.fulfillment === "delivery" ? "Delivery" : "Pickup"} />
            <div className="space-y-4 p-5 text-sm">
              {order.fulfillment === "pickup" ? (
                <div><p className="font-medium">{pickup?.name ?? "—"}</p><p className="text-on-surface-variant">{pickup?.address}, {pickup?.emirate}</p><p className="mt-2">Slot: {slotLabel(order.slotStart, order.slotEnd)}</p></div>
              ) : (
                <>
                  {order.deliveryAddress && (
                    <div>
                      <p className="font-medium">{order.deliveryAddress.name} · {order.deliveryAddress.phone}</p>
                      <p className="text-on-surface-variant">{order.deliveryAddress.line1}{order.deliveryAddress.line2 ? `, ${order.deliveryAddress.line2}` : ""}, {order.deliveryAddress.area}, {order.deliveryAddress.city}, {order.deliveryAddress.emirate}</p>
                      {order.deliveryAddress.notes && <p className="text-on-surface-variant">“{order.deliveryAddress.notes}”</p>}
                      {order.deliveryAddress.lat && <a className="text-primary" target="_blank" href={`https://maps.google.com/?q=${order.deliveryAddress.lat},${order.deliveryAddress.lng}`}>Open in Maps</a>}
                      <p className="mt-2">Slot: {slotLabel(order.slotStart, order.slotEnd)}</p>
                    </div>
                  )}
                  {order.deliveryRef ? (
                    <div className="rounded-lg bg-surface-low p-3">
                      <p><span className="text-on-surface-variant">Courier:</span> <b>{order.deliveryProvider}</b></p>
                      <p><span className="text-on-surface-variant">Ref:</span> {order.deliveryRef}</p>
                      <p><span className="text-on-surface-variant">Status:</span> {order.deliveryStatus}</p>
                      {order.deliveryTrackingUrl && <a className="text-primary" target="_blank" href={order.deliveryTrackingUrl}>Tracking link</a>}
                    </div>
                  ) : (
                    <form action={bookCourier} className="space-y-2">
                      <input type="hidden" name="orderId" value={order.id} />
                      <Select name="provider" defaultValue={tenant.settings.delivery?.defaultProvider ?? "inhouse"}>
                        {enabledProviders.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
                      </Select>
                      <Button className="w-full" disabled={!["paid", "in_production", "ready"].includes(order.status)}>Book delivery</Button>
                      {!["paid", "in_production", "ready"].includes(order.status) && <p className="text-xs text-on-surface-variant">Available once the order is paid.</p>}
                    </form>
                  )}
                  <details className="text-xs">
                    <summary className="cursor-pointer text-on-surface-variant">Enter tracking manually</summary>
                    <form action={setManualTracking} className="mt-2 space-y-2">
                      <input type="hidden" name="orderId" value={order.id} />
                      <Input name="provider" placeholder="Courier name" defaultValue={order.deliveryProvider ?? ""} />
                      <Input name="ref" placeholder="Reference / AWB" defaultValue={order.deliveryRef ?? ""} />
                      <Input name="trackingUrl" placeholder="Tracking URL" defaultValue={order.deliveryTrackingUrl ?? ""} />
                      <Input name="deliveryStatus" placeholder="Status (e.g. assigned, picked)" defaultValue={order.deliveryStatus ?? ""} />
                      <Button variant="secondary" className="w-full">Save</Button>
                    </form>
                  </details>
                </>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Internal notes" subtitle="Only visible to your team" />
            <form action={saveInternalNotes} className="space-y-2 p-5">
              <input type="hidden" name="orderId" value={order.id} />
              <Textarea name="internalNotes" rows={4} defaultValue={order.internalNotes ?? ""} />
              <Button variant="secondary">Save notes</Button>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
  return <div className={`flex justify-between ${bold ? "pt-1 text-base font-bold" : ""}`}><span>{k}</span><span>{v}</span></div>;
}
