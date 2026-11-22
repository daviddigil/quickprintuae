import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Order, Tenant } from "@/db/schema";
import { createStripeCheckout, testStripeKey, verifyStripe } from "./stripe";
import { createMamoCheckout, testMamoKey, verifyMamo } from "./mamo";

/**
 * Create a hosted checkout session for an order with the tenant's own Stripe or Mamo Pay account,
 * insert a `payments` row (status pending) and return the URL to redirect the customer to.
 * successUrl/cancelUrl are absolute URLs; success should land on the order page which calls verifyPayment.
 */
export type ProviderCode = "stripe" | "mamo";

export interface CheckoutResult { url: string; providerRef: string }

export function enabledProviders(tenant: Tenant): ProviderCode[] {
  const p = tenant.settings.payments ?? {};
  const out: ProviderCode[] = [];
  if (p.stripe?.enabled && p.stripe.secretKeyEnc) out.push("stripe");
  if (p.mamo?.enabled && p.mamo.apiKeyEnc) out.push("mamo");
  // Demo mode: offer both simulated providers when the shop has none configured.
  if (!out.length && ["1", "true"].includes(process.env.PAYMENTS_FAKE ?? "")) return ["stripe", "mamo"];
  return out;
}

/** Demo mode: PAYMENTS_FAKE=1 simulates a provider so the full flow can be tested without keys. */
const fakeMode = () => ["1", "true"].includes(process.env.PAYMENTS_FAKE ?? "");

export async function createCheckout(
  tenant: Tenant, order: Order, provider: ProviderCode, urls: { successUrl: string; cancelUrl: string },
): Promise<CheckoutResult> {
  if (order.status !== "pending_payment") throw new Error("Order is not awaiting payment");
  if (order.total <= 0) throw new Error("Order total must be greater than zero");

  let result: CheckoutResult;
  if (fakeMode()) {
    const ref = `fake_${provider}_${order.id.slice(0, 8)}_${Date.now()}`;
    result = { providerRef: ref, url: `${urls.successUrl}${urls.successUrl.includes("?") ? "&" : "?"}fake_payment=${ref}` };
  } else {
    if (!enabledProviders(tenant).includes(provider)) throw new Error(`${provider} is not enabled for this store`);
    result = provider === "stripe" ? await createStripeCheckout(tenant, order, urls) : await createMamoCheckout(tenant, order, urls);
  }

  await db.insert(schema.payments).values({
    tenantId: tenant.id, orderId: order.id, provider, providerRef: result.providerRef,
    checkoutUrl: result.url, amount: order.total, currency: order.currency, status: "pending",
  }).onConflictDoNothing();
  await db.update(schema.orders).set({ paymentProvider: provider, updatedAt: new Date() }).where(eq(schema.orders.id, order.id));
  return result;
}

/**
 * Pull status from the provider (used on return URL in case webhook is late). Calls markOrderPaid when paid.
 * Checks the most recent pending payment attempt(s) for the order.
 */
export async function verifyPayment(tenant: Tenant, order: Order): Promise<boolean> {
  if (order.status !== "pending_payment") return order.paidAt != null;
  const attempts = await db.query.payments.findMany({
    where: and(eq(schema.payments.orderId, order.id), eq(schema.payments.status, "pending")),
    orderBy: desc(schema.payments.createdAt), limit: 3,
  });
  for (const p of attempts) {
    try {
      if (p.providerRef.startsWith("fake_")) {
        if (!fakeMode()) continue;
        const { markOrderPaid } = await import("@/server/orders");
        if (await markOrderPaid(order.id, p.provider, p.providerRef, { fake: true })) return true;
        continue;
      }
      const ok = p.provider === "stripe" ? await verifyStripe(tenant, order, p.providerRef) : await verifyMamo(tenant, order, p.providerRef);
      if (ok) return true;
    } catch (e) {
      console.error(`[payments] verify ${p.provider} ${p.providerRef} failed`, e);
    }
  }
  return false;
}

/** For the admin "Test connection" button. Never throws; returns a friendly message. */
export async function testPaymentCredentials(
  provider: ProviderCode,
  keys: { secretKey?: string; apiKey?: string; sandbox?: boolean },
): Promise<{ ok: boolean; message: string }> {
  try {
    if (provider === "stripe") {
      if (!keys.secretKey?.startsWith("sk_") && !keys.secretKey?.startsWith("rk_")) return { ok: false, message: "Stripe secret key must start with sk_ or rk_" };
      const r = await testStripeKey(keys.secretKey);
      return { ok: true, message: `Connected to ${r.account} (${r.livemode ? "live" : "test"} mode)` };
    }
    if (!keys.apiKey) return { ok: false, message: "Mamo Pay API key is required" };
    const r = await testMamoKey(keys.apiKey, !!keys.sandbox);
    return { ok: true, message: `Connected to ${r.account}` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Connection failed" };
  }
}
