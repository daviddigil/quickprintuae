import "server-only";
import type { SubscriptionGateway } from "./types";

/** PAYMENTS_FAKE / local development: no gateway is called. The "Use test card" button completes the setup directly. */
export const fakeSubscriptionGateway: SubscriptionGateway = {
  code: "fake",
  label: "Test mode (no real card)",
  ready: true,
  async createSetup() { return { kind: "fake" }; },
  async updateCard() { return { kind: "fake" }; },
  async confirmSetup() { return { status: "pending" }; },
  async chargeOffSession(invoice, tenant) {
    return tenant.cardStatus === "on_file" ? { status: "paid", ref: `fake_charge_${invoice.number}` } : { status: "no_card" };
  },
  async removeCard() { /* nothing at a gateway */ },
};
