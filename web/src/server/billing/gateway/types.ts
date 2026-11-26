import type { Tenant, saasInvoices } from "@/db/schema";

export type SaasInvoice = typeof saasInvoices.$inferSelect;

/** A card as the gateway describes it. Only brand/last4/expiry are kept; the fingerprint is stored hashed. */
export interface CardInfo { paymentMethodId: string; brand: string; last4: string; expMonth?: number; expYear?: number; fingerprint: string }

export type SetupStart =
  | { kind: "redirect"; url: string; ref: string }
  | { kind: "fake" }
  | { kind: "unavailable"; reason: string };

export type SetupOutcome =
  | { status: "succeeded"; card: CardInfo }
  | { status: "pending" }
  | { status: "failed"; reason: string };

export type ChargeOutcome =
  | { status: "paid"; ref: string }
  | { status: "no_card" }
  | { status: "requires_action" | "failed"; reason: string };

export interface SetupUrls { returnUrl: string; cancelUrl: string }

/**
 * Subscription card-on-file, one interface for every gateway. The card is entered on the gateway's own hosted page, so no card data
 * touches our servers; we keep only brand, last 4 digits, expiry, the payment-method id and a SHA-256 of the card fingerprint.
 */
export interface SubscriptionGateway {
  code: "stripe" | "mamo" | "fake";
  label: string;
  /** false = implementation exists but cannot take real cards yet (e.g. Mamo, waiting for provider docs) */
  ready: boolean;
  createSetup(tenant: Tenant, urls: SetupUrls): Promise<SetupStart>;
  confirmSetup(tenant: Tenant, ref: string): Promise<SetupOutcome>;
  chargeOffSession(invoice: SaasInvoice, tenant: Tenant): Promise<ChargeOutcome>;
  updateCard(tenant: Tenant, urls: SetupUrls): Promise<SetupStart>;
  removeCard(tenant: Tenant): Promise<void>;
  /** make the confirmed card the default for off-session charges (gateway side) */
  setDefaultCard?(tenant: Tenant, card: CardInfo): Promise<void>;
}
