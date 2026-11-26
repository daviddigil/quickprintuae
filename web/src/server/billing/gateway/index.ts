import "server-only";
import { activeGateways, type PlatformProvider } from "@/server/payments/platform";
import { fakeSubscriptionGateway } from "./fake";
import { mamoSubscriptionGateway } from "./mamo";
import { stripeSubscriptionGateway } from "./stripe";
import type { SubscriptionGateway } from "./types";

export * from "./types";

const REAL: Record<PlatformProvider, SubscriptionGateway> = { stripe: stripeSubscriptionGateway, mamo: mamoSubscriptionGateway };

/** PAYMENTS_FAKE=1, or local development with no live gateway: the card step offers a "Use test card" button. */
export const fakeFlag = () => ["1", "true"].includes(process.env.PAYMENTS_FAKE ?? "");

/** The gateway that can take a real card now: first enabled+keyed platform gateway whose implementation is ready. Null if none. */
export async function liveGateway(): Promise<SubscriptionGateway | null> {
  for (const p of await activeGateways()) if (REAL[p].ready) return REAL[p];
  return null;
}

export async function setupMode() {
  const live = await liveGateway();
  const fake = fakeFlag() || (process.env.NODE_ENV === "development" && !live);
  return { live, fake, /** false = production with no live gateway: show the waitlist instead of signup */ open: !!live || fake };
}

/** Gateway to use for a tenant's card operations (real one if live, else the fake one in test mode). */
export async function getSubscriptionGateway(): Promise<SubscriptionGateway | null> {
  const m = await setupMode();
  return m.live ?? (m.fake ? fakeSubscriptionGateway : null);
}
export { fakeSubscriptionGateway };
