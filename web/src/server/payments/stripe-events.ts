import "server-only";
import type Stripe from "stripe";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { markOrderPaid, setOrderStatus } from "@/server/orders";
import { markInvoicePaid } from "@/server/billing";
import { applyRefund, closeChargeback, openChargeback } from "@/server/payouts/ledger";
import { platformStripeClient, stripeFeeForIntent, toMinor } from "./stripe";

/** The order (and only an order of the tenant named in the metadata) a Stripe object refers to. */
async function orderFor(meta: Stripe.Metadata | null | undefined) {
  const orderId = meta?.orderId;
  if (!orderId) return null;
  const order = await db.query.orders.findFirst({ where: eq(schema.orders.id, orderId) });
  if (!order || (meta?.tenantId && meta.tenantId !== order.tenantId)) return null;
  return order;
}

const piId = (v: string | Stripe.PaymentIntent | null | undefined) => (typeof v === "string" ? v : v?.id);

/** Order payments, refunds and disputes collected on the platform Stripe account. Returns a short note for logs. */
export async function handleStripeOrderEvent(event: Stripe.Event): Promise<string> {
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const s = event.data.object as Stripe.Checkout.Session;
      if (s.metadata?.saasInvoiceId) { if (s.payment_status === "paid") await markInvoicePaid(s.metadata.saasInvoiceId, s.id); return "saas invoice"; }
      const order = await orderFor(s.metadata);
      if (!order || s.payment_status !== "paid") return "ignored";
      if (s.amount_total !== toMinor(order.total)) { console.warn(`[stripe] amount mismatch for order ${order.number}: ${s.amount_total} vs ${toMinor(order.total)}`); return "amount mismatch"; }
      const stripe = await platformStripeClient().catch(() => null);
      const fee = stripe ? await stripeFeeForIntent(stripe, piId(s.payment_intent)) : undefined;
      await markOrderPaid(order.id, "stripe", s.id, { id: s.id, event: event.id, payment_intent: piId(s.payment_intent) }, { gatewayFee: fee });
      return "paid";
    }
    case "payment_intent.succeeded": {
      const pi = event.data.object as Stripe.PaymentIntent;
      if (pi.metadata?.saasInvoiceId) { await markInvoicePaid(pi.metadata.saasInvoiceId, pi.id); return "saas invoice"; }
      const order = await orderFor(pi.metadata);
      if (!order || order.status !== "pending_payment" || pi.amount_received !== toMinor(order.total)) return "ignored";
      // fallback when the checkout.session event is late: use the pending Stripe attempt for this order
      const attempt = await db.query.payments.findFirst({ where: and(eq(schema.payments.orderId, order.id), eq(schema.payments.provider, "stripe")), orderBy: desc(schema.payments.createdAt) });
      if (!attempt) return "no attempt";
      const stripe = await platformStripeClient().catch(() => null);
      await markOrderPaid(order.id, "stripe", attempt.providerRef, { payment_intent: pi.id, event: event.id }, { gatewayFee: stripe ? await stripeFeeForIntent(stripe, pi.id) : undefined });
      return "paid (intent)";
    }
    case "checkout.session.expired":
    case "checkout.session.async_payment_failed": {
      const s = event.data.object as Stripe.Checkout.Session;
      await db.update(schema.payments).set({ status: "failed" }).where(and(eq(schema.payments.providerRef, s.id), eq(schema.payments.status, "pending")));
      return "failed";
    }
    case "charge.refunded": {
      const ch = event.data.object as Stripe.Charge;
      const order = await orderFor(ch.metadata) ?? await orderFor((await metaFromIntent(piId(ch.payment_intent))) ?? undefined);
      if (!order || !order.paidAt) return "ignored";
      const refunded = ch.amount_refunded / 100;
      if (ch.amount_refunded >= ch.amount && order.status !== "refunded") await setOrderStatus(order.id, "refunded", "Refunded via Stripe"); // posts the full reversal itself
      else await applyRefund(order.id, refunded);
      return "refund";
    }
    case "charge.dispute.created": {
      const d = event.data.object as Stripe.Dispute;
      const order = await orderFor(await metaFromCharge(d.charge));
      if (!order) return "ignored";
      await openChargeback(order.id, d.id, d.amount / 100);
      return "dispute opened";
    }
    case "charge.dispute.closed": {
      const d = event.data.object as Stripe.Dispute;
      await closeChargeback(d.id, d.status === "won");
      return `dispute ${d.status}`;
    }
    default: return "ignored";
  }
}

async function metaFromIntent(id: string | undefined) {
  if (!id) return null;
  try { return (await (await platformStripeClient()).paymentIntents.retrieve(id)).metadata; } catch { return null; }
}
async function metaFromCharge(c: string | Stripe.Charge) {
  try {
    const ch = typeof c === "string" ? await (await platformStripeClient()).charges.retrieve(c) : c;
    return Object.keys(ch.metadata ?? {}).length ? ch.metadata : await metaFromIntent(piId(ch.payment_intent));
  } catch { return null; }
}
