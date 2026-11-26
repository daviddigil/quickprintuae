import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { completeCardSetup, markFailed } from "./setup";
import { detachPaymentMethod, retrieveCard, stripeSubscriptionGateway } from "./stripe";
import type { CardInfo } from "./types";

/** injectable for tests (no network) */
export interface SetupEventDeps { retrieveCard: (pmId: string) => Promise<CardInfo | null>; setDefault: (tenantId: string, card: CardInfo) => Promise<void>; detach: (pmId: string) => Promise<void> }
const realDeps: SetupEventDeps = {
  retrieveCard,
  async setDefault(tenantId, card) { const t = await db.query.tenants.findFirst({ where: eq(schema.tenants.id, tenantId) }); if (t) await stripeSubscriptionGateway.setDefaultCard?.(t, card); },
  detach: detachPaymentMethod,
};

/**
 * Contract between the money agent (owns /api/webhooks/stripe) and the onboarding agent (owns card-on-file at signup).
 * The webhook route verifies the signature, then offers every event to this handler first; it returns true if it was a
 * card-setup event that was handled (so the money code skips it).
 *
 * Handled: setup_intent.succeeded, setup_intent.setup_failed, checkout.session.completed (mode=setup).
 * Only events our own setup flow created (metadata.purpose = "card_setup") are claimed. Idempotent by event id.
 */
export async function handleStripeSetupEvent(event: { id: string; type: string; data: { object: Record<string, unknown> } }, deps: SetupEventDeps = realDeps): Promise<boolean> {
  const o = event.data.object as { id?: string; mode?: string; customer?: string | null; payment_method?: string | null; metadata?: Record<string, string> | null; last_setup_error?: { message?: string } | null };
  if (!["setup_intent.succeeded", "setup_intent.setup_failed", "checkout.session.completed"].includes(event.type)) return false;
  if (o.metadata?.purpose !== "card_setup") return false;
  if (event.type === "checkout.session.completed" && o.mode !== "setup") return false;

  const seen = await db.query.gatewaySetupEvents.findFirst({ where: eq(schema.gatewaySetupEvents.eventId, event.id) });
  if (seen) return true;

  let tenantId: string | null = o.metadata?.tenantId ?? null;
  const customerId = o.customer;
  if (!tenantId && customerId) tenantId = (await db.query.tenants.findFirst({ where: eq(schema.tenants.stripeCustomerId, customerId), columns: { id: true } }))?.id ?? null;

  if (tenantId) {
    if (event.type === "setup_intent.succeeded" && o.payment_method) {
      const card = await deps.retrieveCard(o.payment_method);
      if (card) {
        const r = await completeCardSetup(tenantId, card, { gateway: "stripe", eventId: event.id });
        if (r.ok) await deps.setDefault(tenantId, card);
        else await deps.detach(card.paymentMethodId); // a refused card must not stay attached to the customer
      }
    } else if (event.type === "setup_intent.setup_failed") {
      const tenant = await db.query.tenants.findFirst({ where: eq(schema.tenants.id, tenantId) });
      if (tenant) await markFailed(tenant, o.last_setup_error?.message?.slice(0, 200) ?? "The card could not be verified.");
    }
    // checkout.session.completed (mode=setup) is claimed here; the setup_intent.succeeded event does the work
  }
  await db.insert(schema.gatewaySetupEvents).values({ eventId: event.id, type: event.type, tenantId }).onConflictDoNothing();
  return true;
}

