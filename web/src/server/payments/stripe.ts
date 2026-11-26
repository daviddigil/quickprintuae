import "server-only";
import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Order, Tenant } from "@/db/schema";
import { markOrderPaid } from "@/server/orders";
import { getPlatformGateway } from "./platform";

/** Stripe client bound to the PLATFORM account. Customer money always lands there; shops never hold keys. */
export async function platformStripeClient(): Promise<Stripe> {
  const g = await getPlatformGateway("stripe");
  if (!g.secretKey) throw new Error("Stripe is not configured");
  return new Stripe(g.secretKey);
}

/** AED is a 2-decimal currency → fils. */
export const toMinor = (aed: number) => Math.round(aed * 100);

export async function createStripeCheckout(
  tenant: Tenant, order: Order, urls: { successUrl: string; cancelUrl: string },
) {
  const stripe = await platformStripeClient();
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

/** The real processing fee (AED) Stripe charged for a payment intent, or undefined when it cannot be read yet. Best effort. */
export async function stripeFeeForIntent(stripe: Stripe, paymentIntentId: string | null | undefined): Promise<number | undefined> {
  if (!paymentIntentId) return undefined;
  try {
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ["latest_charge.balance_transaction"] });
    const bt = (pi.latest_charge as Stripe.Charge | null)?.balance_transaction as Stripe.BalanceTransaction | null | undefined;
    return bt && typeof bt === "object" && typeof bt.fee === "number" ? bt.fee / 100 : undefined;
  } catch { return undefined; }
}

export async function verifyStripe(tenant: Tenant, order: Order, sessionId: string) {
  const stripe = await platformStripeClient();
  const s = await stripe.checkout.sessions.retrieve(sessionId);
  if (s.metadata?.orderId !== order.id || (s.metadata?.tenantId && s.metadata.tenantId !== tenant.id)) return false;
  if (s.payment_status === "paid" && s.amount_total === toMinor(order.total)) {
    const pi = typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent?.id;
    await markOrderPaid(order.id, "stripe", s.id, { id: s.id, payment_intent: pi, amount_total: s.amount_total }, { gatewayFee: await stripeFeeForIntent(stripe, pi) });
    return true;
  }
  return false;
}

export async function testStripeKey(secretKey: string) {
  const stripe = new Stripe(secretKey);
  const acct = await stripe.accounts.retrieveCurrent();
  return { ok: true as const, account: acct.settings?.dashboard?.display_name ?? acct.id, livemode: secretKey.startsWith("sk_live") };
}
