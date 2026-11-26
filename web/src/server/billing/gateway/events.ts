import "server-only";

/**
 * Contract between the money agent (owns /api/webhooks/stripe) and the onboarding agent (owns card-on-file at signup).
 * The webhook route verifies the signature, then offers every event to this handler first; return true if it was a
 * card-setup event that was handled (setup_intent.succeeded / setup_intent.setup_failed / payment_method.* ...).
 * STUB: the onboarding agent replaces the body, keep the signature.
 */
export async function handleStripeSetupEvent(_event: { id: string; type: string; data: { object: Record<string, unknown> } }): Promise<boolean> {
  return false;
}
