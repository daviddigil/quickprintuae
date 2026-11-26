import "server-only";
import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Tenant } from "@/db/schema";
import { getPlatformGateway } from "@/server/payments/platform";
import type { CardInfo, ChargeOutcome, SaasInvoice, SetupOutcome, SetupStart, SubscriptionGateway } from "./types";

/** Stripe client for the PLATFORM account (keys come from getPlatformGateway, superadmin-managed). Null when not keyed. */
export async function stripeClient(): Promise<Stripe | null> {
  const g = await getPlatformGateway("stripe");
  return g.enabled && g.secretKey ? new Stripe(g.secretKey) : null;
}
async function needStripe() { const s = await stripeClient(); if (!s) throw new Error("Stripe is not configured"); return s; }

/** One Stripe customer per shop. */
async function ensureCustomer(stripe: Stripe, tenant: Tenant): Promise<string> {
  if (tenant.stripeCustomerId) return tenant.stripeCustomerId;
  const c = await stripe.customers.create({ email: tenant.email ?? undefined, name: tenant.legalName ?? tenant.name, metadata: { tenantId: tenant.id, slug: tenant.slug } }, { idempotencyKey: `qp-customer-${tenant.id}` });
  await db.update(schema.tenants).set({ stripeCustomerId: c.id }).where(eq(schema.tenants.id, tenant.id));
  return c.id;
}

export function cardFromPaymentMethod(pm: Stripe.PaymentMethod): CardInfo | null {
  const c = pm.card;
  if (!c) return null;
  // some accounts omit the fingerprint; fall back to the payment-method id so a missing value can never equal another card
  return { paymentMethodId: pm.id, brand: c.brand, last4: c.last4, expMonth: c.exp_month, expYear: c.exp_year, fingerprint: c.fingerprint ?? `pm:${pm.id}` };
}

/** Read the card behind a payment method (webhook and return-URL paths). */
export async function retrieveCard(paymentMethodId: string): Promise<CardInfo | null> {
  const stripe = await needStripe();
  return cardFromPaymentMethod(await stripe.paymentMethods.retrieve(paymentMethodId));
}

async function startSetup(tenant: Tenant, urls: { returnUrl: string; cancelUrl: string }): Promise<SetupStart> {
  const stripe = await needStripe();
  const customer = await ensureCustomer(stripe, tenant);
  // Stripe-hosted page in "setup" mode: a SetupIntent (3-D Secure included) with usage=off_session, so we never see card data.
  const session = await stripe.checkout.sessions.create({
    mode: "setup", customer, client_reference_id: tenant.id,
    metadata: { tenantId: tenant.id, purpose: "card_setup" },
    setup_intent_data: { metadata: { tenantId: tenant.id, purpose: "card_setup" }, description: `QuickPrint subscription card for ${tenant.slug}` },
    success_url: `${urls.returnUrl}${urls.returnUrl.includes("?") ? "&" : "?"}session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: urls.cancelUrl,
  });
  if (!session.url) throw new Error("Stripe did not return a setup URL");
  return { kind: "redirect", url: session.url, ref: session.id };
}

export const stripeSubscriptionGateway: SubscriptionGateway = {
  code: "stripe",
  label: "Stripe",
  ready: true,
  createSetup: startSetup,
  updateCard: startSetup,

  async confirmSetup(tenant, ref): Promise<SetupOutcome> {
    const stripe = await needStripe();
    const session = await stripe.checkout.sessions.retrieve(ref, { expand: ["setup_intent.payment_method"] });
    // the session must belong to this shop (the return URL is reachable by anyone logged in)
    if (session.metadata?.tenantId !== tenant.id) return { status: "failed", reason: "This card setup belongs to a different account." };
    const si = session.setup_intent && typeof session.setup_intent !== "string" ? session.setup_intent : null;
    if (!si) return { status: "pending" };
    if (si.status === "succeeded") {
      const pm = si.payment_method && typeof si.payment_method !== "string" ? si.payment_method : null;
      const card = pm ? cardFromPaymentMethod(pm) : null;
      return card ? { status: "succeeded", card } : { status: "failed", reason: "Only card payments are supported." };
    }
    if (si.status === "canceled" || si.status === "requires_payment_method") return { status: "failed", reason: si.last_setup_error?.message ?? "The card could not be verified." };
    return { status: "pending" };
  },

  async setDefaultCard(tenant, card) {
    const stripe = await needStripe();
    const customer = await ensureCustomer(stripe, tenant);
    await stripe.customers.update(customer, { invoice_settings: { default_payment_method: card.paymentMethodId } });
  },

  async chargeOffSession(invoice: SaasInvoice, tenant: Tenant): Promise<ChargeOutcome> {
    const stripe = await needStripe();
    if (!tenant.stripeCustomerId) return { status: "no_card" };
    const cust = await stripe.customers.retrieve(tenant.stripeCustomerId);
    const pm = !cust.deleted ? cust.invoice_settings?.default_payment_method : null;
    if (!pm) return { status: "no_card" };
    try {
      const pi = await stripe.paymentIntents.create({
        amount: Math.round(invoice.total * 100), currency: "aed", customer: tenant.stripeCustomerId, payment_method: typeof pm === "string" ? pm : pm.id,
        off_session: true, confirm: true, description: `QuickPrint ${invoice.number}`, metadata: { saasInvoiceId: invoice.id },
      }, { idempotencyKey: `qp-invoice-${invoice.id}` });
      if (pi.status === "succeeded") return { status: "paid", ref: pi.id };
      return { status: pi.status === "requires_action" ? "requires_action" : "failed", reason: `Payment ${pi.status}` };
    } catch (e) {
      return { status: "failed", reason: (e as Error).message };
    }
  },

  async removeCard(tenant) {
    const stripe = await needStripe();
    const pmId = tenant.billingRef?.paymentMethodId;
    if (pmId) await stripe.paymentMethods.detach(pmId).catch(() => {});
    if (tenant.stripeCustomerId) await stripe.customers.update(tenant.stripeCustomerId, { invoice_settings: { default_payment_method: "" } }).catch(() => {});
  },
};

export async function detachPaymentMethod(paymentMethodId: string) {
  const stripe = await stripeClient();
  if (stripe) await stripe.paymentMethods.detach(paymentMethodId).catch(() => {});
}
