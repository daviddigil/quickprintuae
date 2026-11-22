import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { CheckCircle2, MapPin, Truck } from "lucide-react";
import { db, schema } from "@/db";
import { getCustomer } from "@/lib/auth";
import { requireStorefrontTenant } from "@/lib/tenant";
import { formatAED } from "@/lib/pricing";
import { formatUaeDateTime, formatUaeTime } from "@/lib/slots";
import { ORDER_STATUS_LABEL, type OrderStatus } from "@/lib/types";
import { Alert, Badge, Card, ORDER_STATUS_TONE } from "@/components/ui";
import { CardPreview } from "@/components/card-designer/CardDesigner";
import { enabledProviders, verifyPayment } from "@/server/payments";
import { verifyOrderToken } from "@/server/checkout";
import { PayAgain } from "@/components/store/pay-again";

export const metadata = { title: "Order", robots: { index: false } };
export const dynamic = "force-dynamic";

type P = { params: Promise<{ tenant: string; id: string }>; searchParams: Promise<{ t?: string; paid?: string; cancelled?: string }> };

const FLOW: OrderStatus[] = ["pending_payment", "paid", "in_production", "ready"];

export default async function OrderPage({ params, searchParams }: P) {
  const { tenant: tp, id } = await params;
  const { t, paid, cancelled } = await searchParams;
  const tenant = await requireStorefrontTenant(tp);
  if (!z.string().uuid().safeParse(id).success) notFound();
  let order = await db.query.orders.findFirst({ where: and(eq(schema.orders.id, id), eq(schema.orders.tenantId, tenant.id)) });
  if (!order) notFound();
  const customer = await getCustomer(tenant.id);
  if (!verifyOrderToken(order.id, t) && !(customer && order.customerId === customer.id)) notFound();

  if (order.status === "pending_payment") {
    try {
      if (await verifyPayment(tenant, order)) order = (await db.query.orders.findFirst({ where: eq(schema.orders.id, id) }))!;
    } catch (e) { console.error("verifyPayment failed", e); }
  }

  const [items, events, location] = await Promise.all([
    db.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, order.id)),
    db.select().from(schema.orderEvents).where(eq(schema.orderEvents.orderId, order.id)).orderBy(asc(schema.orderEvents.createdAt)),
    order.pickupLocationId ? db.query.pickupLocations.findFirst({ where: eq(schema.pickupLocations.id, order.pickupLocationId) }) : Promise.resolve(undefined),
  ]);
  const finalStep: OrderStatus = order.fulfillment === "pickup" ? "picked_up" : "delivered";
  const steps: OrderStatus[] = order.fulfillment === "pickup" ? [...FLOW, finalStep] : [...FLOW, "out_for_delivery", finalStep];
  const reached = steps.indexOf(order.status as OrderStatus);
  const closed = order.status === "cancelled" || order.status === "refunded";

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      {paid && order.status === "pending_payment" && <div className="mb-4"><Alert tone="blue">We&apos;re confirming your payment with the provider. This page will update shortly — refresh in a moment.</Alert></div>}
      {cancelled && order.status === "pending_payment" && <div className="mb-4"><Alert tone="yellow">Payment was cancelled. Your order is saved — you can pay below.</Alert></div>}
      {order.status === "paid" && paid && <div className="mb-4"><Alert tone="green">Payment received — thank you! We&apos;ll start printing right away.</Alert></div>}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-slate-500">Order</p>
          <h1 className="text-2xl font-bold" data-testid="order-number">{order.number}</h1>
          <p className="text-sm text-slate-500">Placed {formatUaeDateTime(order.createdAt)}</p>
        </div>
        <Badge tone={ORDER_STATUS_TONE[order.status]}>{ORDER_STATUS_LABEL[order.status as OrderStatus]}</Badge>
      </div>

      {order.status === "pending_payment" && (
        <Card className="mt-6 p-5">
          <p className="font-semibold">Awaiting payment of {formatAED(order.total)}</p>
          <p className="text-sm text-slate-600">Your order goes into production as soon as payment is confirmed.</p>
          <PayAgain store={tenant.slug} orderId={order.id} token={t} providers={enabledProviders(tenant)} />
        </Card>
      )}

      {!closed && (
        <ol className="mt-8 grid gap-2" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0,1fr))` }}>
          {steps.map((s, i) => (
            <li key={s} className="text-center">
              <div className={`mx-auto h-1.5 rounded-full ${i <= reached ? "btn-store" : "bg-slate-200"}`} />
              <p className={`mt-2 text-xs ${i <= reached ? "font-semibold text-slate-900" : "text-slate-400"}`}>{ORDER_STATUS_LABEL[s]}</p>
            </li>
          ))}
        </ol>
      )}

      <div className="mt-8 grid gap-6 md:grid-cols-[1fr_300px]">
        <Card>
          <ul className="divide-y divide-slate-100">
            {items.map((it) => (
              <li key={it.id} className="flex gap-4 p-4">
                {it.design && <CardPreview design={it.design} className="h-16 w-24 shrink-0 rounded" />}
                <div className="flex-1">
                  <p className="font-semibold">{it.productName}</p>
                  <p className="text-sm text-slate-600">{it.pages > 1 ? `${it.pages} pages × ${it.quantity}` : `Qty ${it.quantity.toLocaleString()}`}</p>
                  <p className="mt-1 text-xs text-slate-500">{Object.values(it.selectionLabels ?? {}).join(" · ")}</p>
                </div>
                <p className="font-medium">{formatAED(it.lineTotal)}</p>
              </li>
            ))}
          </ul>
          <dl className="space-y-1 border-t border-slate-100 p-4 text-sm">
            <div className="flex justify-between"><dt className="text-slate-600">Subtotal</dt><dd>{formatAED(order.subtotal)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-600">{order.fulfillment === "delivery" ? "Delivery" : "Pickup"}</dt><dd>{order.deliveryFee ? formatAED(order.deliveryFee) : "Free"}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-600">VAT</dt><dd>{formatAED(order.vat)}</dd></div>
            <div className="flex justify-between pt-1 text-base font-bold"><dt>Total</dt><dd>{formatAED(order.total)}</dd></div>
          </dl>
        </Card>

        <div className="space-y-4">
          <Card className="p-4 text-sm">
            {order.fulfillment === "pickup" ? (
              <>
                <p className="flex items-center gap-2 font-semibold"><MapPin className="text-store h-4 w-4" />Pickup</p>
                {location && <p className="mt-1 text-slate-600">{location.name}<br />{location.address}, {location.emirate}</p>}
                {location?.mapUrl && <a href={location.mapUrl} target="_blank" rel="noopener noreferrer" className="text-store mt-1 inline-block font-medium">Open map</a>}
              </>
            ) : (
              <>
                <p className="flex items-center gap-2 font-semibold"><Truck className="text-store h-4 w-4" />Delivery</p>
                {order.deliveryAddress && <p className="mt-1 text-slate-600">{order.deliveryAddress.line1}{order.deliveryAddress.line2 ? `, ${order.deliveryAddress.line2}` : ""}<br />{order.deliveryAddress.area}, {order.deliveryAddress.city}, {order.deliveryAddress.emirate}</p>}
                {order.deliveryTrackingUrl && <a href={order.deliveryTrackingUrl} target="_blank" rel="noopener noreferrer" className="text-store mt-2 inline-block font-medium">Track your delivery</a>}
              </>
            )}
            {order.slotStart && <p className="mt-3 text-slate-600"><span className="font-medium text-slate-900">Slot:</span> {formatUaeDateTime(order.slotStart)}{order.slotEnd ? ` – ${formatUaeTime(order.slotEnd)}` : ""}</p>}
          </Card>
          <Card className="p-4 text-sm">
            <p className="font-semibold">Timeline</p>
            <ul className="mt-3 space-y-3">
              {events.map((e) => (
                <li key={e.id} className="flex gap-2">
                  <CheckCircle2 className="text-store mt-0.5 h-4 w-4 shrink-0" />
                  <div><p className="font-medium">{ORDER_STATUS_LABEL[e.status as OrderStatus] ?? e.status}</p>{e.message && <p className="text-slate-600">{e.message}</p>}<p className="text-xs text-slate-400">{formatUaeDateTime(e.createdAt)}</p></div>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
