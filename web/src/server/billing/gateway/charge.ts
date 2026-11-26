import "server-only";
import type { Tenant } from "@/db/schema";
import { fakeSubscriptionGateway, liveGateway } from "./index";
import { stripeClient } from "./stripe";
import type { ChargeOutcome, SaasInvoice } from "./types";

/** Charge an invoice to the card on file through the gateway that holds it. Never throws. */
export async function chargeWithCardOnFile(inv: SaasInvoice, tenant: Tenant): Promise<ChargeOutcome> {
  if (tenant.cardStatus !== "on_file") return { status: "no_card" };
  try {
    const gw = tenant.billingRef?.cardGateway === "fake" ? fakeSubscriptionGateway : await liveGateway();
    if (!gw) return { status: "no_card" };
    return await gw.chargeOffSession(inv, tenant);
  } catch (e) {
    return { status: "failed", reason: (e as Error).message };
  }
}

/** Stripe client from the platform gateway settings (superadmin-managed), for the hosted-link fallback in collectInvoice. */
export const platformStripeFromGateway = () => stripeClient();
