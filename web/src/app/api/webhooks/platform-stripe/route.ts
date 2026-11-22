import { NextResponse } from "next/server";
import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { env } from "@/lib/env";
import { markInvoicePaid, platformStripe } from "@/server/billing";

/** Platform (SaaS) Stripe webhook: subscription invoice payments from print shops. */
export async function POST(req: Request) {
  const stripe = platformStripe();
  if (!stripe || !env.platformStripeWebhookSecret) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, req.headers.get("stripe-signature") ?? "", env.platformStripeWebhookSecret);
  } catch {
    return NextResponse.json({ error: "Bad signature" }, { status: 400 });
  }
  if (event.type === "checkout.session.completed") {
    const s = event.data.object as Stripe.Checkout.Session;
    const invoiceId = s.metadata?.saasInvoiceId;
    const tenantId = s.metadata?.tenantId;
    if (tenantId && typeof s.customer === "string") {
      await db.update(schema.tenants).set({ stripeCustomerId: s.customer }).where(eq(schema.tenants.id, tenantId));
    }
    if (invoiceId && s.payment_status === "paid") await markInvoicePaid(invoiceId, s.id);
    // save card as default for future off-session charges
    if (typeof s.customer === "string" && typeof s.payment_intent === "string") {
      try {
        const pi = await stripe.paymentIntents.retrieve(s.payment_intent);
        if (typeof pi.payment_method === "string")
          await stripe.customers.update(s.customer, { invoice_settings: { default_payment_method: pi.payment_method } });
      } catch { /* non-fatal */ }
    }
  } else if (event.type === "payment_intent.succeeded") {
    const pi = event.data.object as Stripe.PaymentIntent;
    if (pi.metadata?.saasInvoiceId) await markInvoicePaid(pi.metadata.saasInvoiceId, pi.id);
  }
  return NextResponse.json({ received: true });
}
