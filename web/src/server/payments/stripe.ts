import "server-only";
import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Order, Tenant } from "@/db/schema";
import { decrypt } from "@/lib/crypto";
import { markOrderPaid } from "@/server/orders";

/** Stripe client bound to the tenant's own account (each print shop gets paid directly). */
export function tenantStripe(tenant: Tenant): Stripe {
  const key = decrypt(tenant.settings.payments?.stripe?.secretKeyEnc);
  if (!key) throw new Error("Stripe is not configured for this store");
  return new Stripe(key);
}

/** AED is a 2-decimal currency → fils. */
export const toMinor = (aed: number) => Math.round(aed * 100);

export async function createStripeCheckout(
  tenant: Tenant, order: Order, urls: { successUrl: string; cancelUrl: string },
) {
  const stripe = tenantStripe(tenant);
  const items = await db.query.orderItems.findMany({ where: eq(schema.orderItems.orderId, order.id) });

  // Itemised lines when they reconcile with the order total, otherwise one total line (safer for discounts/VAT-inclusive).
  const lines: Stripe.Checkout.SessionCreateParams.LineItem[] = items.map((it) => ({
    quantity: 1,
    price_data: {
      currency: "aed",
      unit_amount: toMinor(it.lineTotal),
      product_data: { name: `${it.productName} × ${it.quantity}${it.pages > 1 ? ` (${it.pages} pages)` : ""}` },
    },
  }));
  if (order.deliveryFee > 0) lines.push({ quantity: 1, price_data: { currency: "aed", unit_amount: toMinor(order.deliveryFee), product_data: { name: "Delivery" } } });
  if (!tenant.settings.pricesIncludeVat && order.vat > 0)
    lines.push({ quantity: 1, price_data: { currency: "aed", unit_amount: toMinor(order.vat), product_data: { name: `VAT ${tenant.settings.vatRate}%` } } });
  const sum = lines.reduce((a, l) => a + (l.price_data!.unit_amount ?? 0), 0);
  const finalLines: Stripe.Checkout.SessionCreateParams.LineItem[] = sum === toMinor(order.total) ? lines : [{
    quantity: 1,
    price_data: { currency: "aed", unit_amount: toMinor(order.total), product_data: { name: `${tenant.name} order ${order.number}` } },
  }];

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: finalLines,
    customer_email: order.customerEmail,
    client_reference_id: order.id,
    metadata: { orderId: order.id, tenantId: tenant.id, orderNumber: order.number },
    payment_intent_data: { metadata: { orderId: order.id, tenantId: tenant.id }, description: `Order ${order.number}` },
    success_url: `${urls.successUrl}${urls.successUrl.includes("?") ? "&" : "?"}session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: urls.cancelUrl,
    expires_at: Math.floor(Date.now() / 1000) + 60 * 60, // 1h
  }, { idempotencyKey: `order-${order.id}-${toMinor(order.total)}-${Date.now() / 60000 | 0}` });

  if (!session.url) throw new Error("Stripe did not return a checkout URL");
  return { url: session.url, providerRef: session.id };
}

export async function verifyStripe(tenant: Tenant, order: Order, sessionId: string) {
  const stripe = tenantStripe(tenant);
  const s = await stripe.checkout.sessions.retrieve(sessionId);
  if (s.metadata?.orderId !== order.id) return false;
  if (s.payment_status === "paid" && s.amount_total === toMinor(order.total)) {
    await markOrderPaid(order.id, "stripe", s.id, { id: s.id, payment_intent: s.payment_intent, amount_total: s.amount_total });
    return true;
  }
  return false;
}

export async function testStripeKey(secretKey: string) {
  const stripe = new Stripe(secretKey);
  const acct = await stripe.accounts.retrieveCurrent();
  return { ok: true as const, account: acct.settings?.dashboard?.display_name ?? acct.id, livemode: secretKey.startsWith("sk_live") };
}
