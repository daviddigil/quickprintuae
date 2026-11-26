import "server-only";
import type { SubscriptionGateway } from "./types";

/**
 * MAMO PAY: NOT CONFIGURED. WAITING FOR PROVIDER DOCS.
 * Mamo recurring / tokenised-card endpoints are not documented to us yet, so nothing here calls Mamo. The class exists so the
 * superadmin can already see "Mamo" as a switchable gateway and so the rest of the app codes against one interface.
 * When the docs arrive: implement createSetup (hosted card-capture link), confirmSetup (read the token/last4/brand),
 * chargeOffSession (charge the stored token) and removeCard, then set `ready = true`. Nothing else needs to change.
 */
const WAITING = "Mamo Pay card-on-file is not configured yet: waiting for the provider's recurring-payments documentation.";

export const mamoSubscriptionGateway: SubscriptionGateway = {
  code: "mamo",
  label: "Mamo Pay (not configured)",
  ready: false,
  async createSetup() { return { kind: "unavailable", reason: WAITING }; },
  async confirmSetup() { return { status: "failed", reason: WAITING }; },
  async chargeOffSession() { return { status: "failed", reason: WAITING }; },
  async updateCard() { return { kind: "unavailable", reason: WAITING }; },
  async removeCard() { /* nothing stored at Mamo yet */ },
};
