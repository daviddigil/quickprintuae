import "server-only";
import type { Order, Tenant } from "@/db/schema";

/**
 * CONTRACT (implemented by the integrations agent):
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
  return out;
}

export async function createCheckout(
  _tenant: Tenant, _order: Order, _provider: ProviderCode, _urls: { successUrl: string; cancelUrl: string },
): Promise<CheckoutResult> {
  throw new Error("not implemented");
}

/** Pull status from the provider (used on return URL in case webhook is late). Calls markOrderPaid when paid. */
export async function verifyPayment(_tenant: Tenant, _order: Order): Promise<boolean> {
  return false;
}
