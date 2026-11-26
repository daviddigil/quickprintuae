import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Order, Tenant } from "@/db/schema";
import { createStripeCheckout, testStripeKey, verifyStripe } from "./stripe";
import { activeGateways } from "./platform";

/**
 * Customer payments are collected on the PLATFORM's gateway accounts (Stripe, configured by the superadmin
 * in /superadmin/gateways). Shops never hold gateway keys; they are paid out from the ledger in payout batches.
 * createCheckout inserts a `payments` row (status pending) and returns the hosted URL to redirect the customer to.
 * successUrl/cancelUrl are absolute URLs; success should land on the order page which calls verifyPayment.
 */
export type ProviderCode = "stripe";

export interface CheckoutResult { url: string; providerRef: string }

/** Demo mode: PAYMENTS_FAKE=1 simulates the gateways so the full flow can be tested without keys. */
const fakeFlag = () => ["1", "true"].includes(process.env.PAYMENTS_FAKE ?? "");

/** Whichever platform gateways are live (enabled + keyed). Falls back to simulated providers in fake mode / local development. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- kept so every platform gateway can later be filtered per shop
export async function enabledProviders(_tenant?: Tenant): Promise<ProviderCode[]> {
  const active = await activeGateways();
  if (active.length) return active;
  if (await fakeMode()) return ["stripe"];
  return [];
}

/** Simulated checkout: explicit PAYMENTS_FAKE flag, or, in local development ONLY, when no platform gateway is configured. Never automatic in production. */
async function fakeMode(): Promise<boolean> {
  if (fakeFlag()) return true;
  return process.env.NODE_ENV === "development" && (await activeGateways()).length === 0;
}

export async function createCheckout(
  tenant: Tenant, order: Order, provider: ProviderCode, urls: { successUrl: string; cancelUrl: string },
): Promise<CheckoutResult> {
  if (order.status !== "pending_payment") throw new Error("Order is not awaiting payment");
  if (order.total <= 0) throw new Error("Order total must be greater than zero");

  let result: CheckoutResult;
  if (await fakeMode()) {
    const ref = `fake_${provider}_${order.id.slice(0, 8)}_${Date.now()}`;
    result = { providerRef: ref, url: `${urls.successUrl}${urls.successUrl.includes("?") ? "&" : "?"}fake_payment=${ref}` };
  } else {
    if (!(await activeGateways()).includes(provider)) throw new Error(`${provider} is not available right now`);
    result = provider === "stripe" ? await createStripeCheckout(tenant, order, urls) : (() => { throw new Error(`Unsupported provider ${provider}`); })();
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
        if (!(await fakeMode())) continue;
        const { markOrderPaid } = await import("@/server/orders");
        if (p.provider === "stripe" && await markOrderPaid(order.id, "stripe", p.providerRef, { fake: true })) return true;
        continue;
      }
      const ok = p.provider === "stripe" ? await verifyStripe(tenant, order, p.providerRef) : false; // legacy provider rows cannot be verified any more
      if (ok) return true;
    } catch (e) {
      console.error(`[payments] verify ${p.provider} ${p.providerRef} failed`, e);
    }
  }
  return false;
}

/** For the superadmin "Test credentials" button. Never throws; returns a friendly message. */
export async function testPaymentCredentials(
  provider: ProviderCode,
  keys: { secretKey?: string },
): Promise<{ ok: boolean; message: string }> {
  if (fakeFlag()) return { ok: true, message: "Fake mode (PAYMENTS_FAKE=1): credentials were not sent to the gateway" };
  try {
    if (provider !== "stripe") return { ok: false, message: "Stripe is the only supported gateway" };
    if (!keys.secretKey?.startsWith("sk_") && !keys.secretKey?.startsWith("rk_")) return { ok: false, message: "Stripe secret key must start with sk_ or rk_" };
    const r = await testStripeKey(keys.secretKey);
    return { ok: true, message: `Connected to ${r.account} (${r.livemode ? "live" : "test"} mode)` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Connection failed" };
  }
}
