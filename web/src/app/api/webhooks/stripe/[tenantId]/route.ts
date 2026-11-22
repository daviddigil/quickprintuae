import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { db, schema } from "@/db";
import { decrypt } from "@/lib/crypto";
import { tenantStripe, toMinor } from "@/server/payments/stripe";
import { markOrderPaid } from "@/server/orders";

export const runtime = "nodejs";

/** Each tenant registers https://<app>/api/webhooks/stripe/<tenantId> in their own Stripe dashboard. */
export async function POST(req: Request, { params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  const tenant = await db.query.tenants.findFirst({ where: eq(schema.tenants.id, tenantId) }).catch(() => undefined);
  if (!tenant) return NextResponse.json({ error: "unknown tenant" }, { status: 404 });
  const secret = decrypt(tenant.settings.payments?.stripe?.webhookSecretEnc);
  if (!secret) return NextResponse.json({ error: "webhook not configured" }, { status: 400 });

  const body = await req.text();
  const sig = req.headers.get("stripe-signature") ?? "";
  let event: Stripe.Event;
  try {
    event = tenantStripe(tenant).webhooks.constructEvent(body, sig, secret);
  } catch {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const s = event.data.object as Stripe.Checkout.Session;
    const orderId = s.metadata?.orderId;
    if (orderId && s.metadata?.tenantId === tenant.id && s.payment_status === "paid") {
      const order = await db.query.orders.findFirst({ where: eq(schema.orders.id, orderId) });
      if (order && order.tenantId === tenant.id && s.amount_total === toMinor(order.total)) {
        await markOrderPaid(order.id, "stripe", s.id, { id: s.id, event: event.id, payment_intent: s.payment_intent });
      } else if (order) {
        console.warn(`[stripe] amount mismatch for order ${order.number}: ${s.amount_total} vs ${toMinor(order.total)}`);
      }
    }
  } else if (event.type === "checkout.session.expired" || event.type === "checkout.session.async_payment_failed") {
    const s = event.data.object as Stripe.Checkout.Session;
    await db.update(schema.payments).set({ status: "failed" }).where(eq(schema.payments.providerRef, s.id));
  }
  return NextResponse.json({ received: true });
}
