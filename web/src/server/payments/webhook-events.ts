import "server-only";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";

/** Idempotency: true the first time an event id is seen for a provider, false for replays/duplicates. */
export async function claimWebhookEvent(provider: "stripe" | "mamo", eventId: string, type?: string): Promise<boolean> {
  const rows = await db.insert(schema.paymentWebhookEvents).values({ provider, eventId, type: type ?? null }).onConflictDoNothing().returning({ id: schema.paymentWebhookEvents.id });
  return rows.length > 0;
}

/** Processing failed: forget the event so the gateway's retry is handled instead of being dropped as a duplicate. */
export async function releaseWebhookEvent(provider: "stripe" | "mamo", eventId: string) {
  await db.delete(schema.paymentWebhookEvents).where(and(eq(schema.paymentWebhookEvents.provider, provider), eq(schema.paymentWebhookEvents.eventId, eventId)));
}
