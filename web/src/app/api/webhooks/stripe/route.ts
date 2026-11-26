import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getPlatformGateway } from "@/server/payments/platform";
import { claimWebhookEvent, releaseWebhookEvent } from "@/server/payments/webhook-events";
import { handleStripeOrderEvent } from "@/server/payments/stripe-events";
import { handleStripeSetupEvent } from "@/server/billing/gateway/events";

export const runtime = "nodejs";

/**
 * The PLATFORM Stripe webhook (register https://<app>/api/webhooks/stripe in the platform's Stripe dashboard).
 * Signature verified with the platform webhook secret (Stripe also rejects timestamps older than 5 minutes, so captured
 * requests cannot be replayed later); every event id is processed once.
 */
export async function POST(req: Request) {
  const g = await getPlatformGateway("stripe");
  if (!g.secretKey || !g.webhookSecret) return NextResponse.json({ error: "Stripe webhook is not configured" }, { status: 503 });
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = new Stripe(g.secretKey).webhooks.constructEvent(body, req.headers.get("stripe-signature") ?? "", g.webhookSecret);
  } catch {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }
  if (!(await claimWebhookEvent("stripe", event.id, event.type))) return NextResponse.json({ received: true, duplicate: true });
  try {
    // card-on-file (SetupIntent) events belong to the onboarding flow: offer them first
    const handled = await handleStripeSetupEvent(event as unknown as { id: string; type: string; data: { object: Record<string, unknown> } });
    const note = handled ? "setup" : await handleStripeOrderEvent(event);
    return NextResponse.json({ received: true, handled: note });
  } catch (e) {
    await releaseWebhookEvent("stripe", event.id).catch(() => {});
    console.error(`[stripe webhook] ${event.type} ${event.id} failed`, e);
    return NextResponse.json({ error: "processing failed" }, { status: 500 });
  }
}
