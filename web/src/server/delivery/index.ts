import "server-only";
import { createHmac, timingSafeEqual } from "crypto";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Order, Tenant } from "@/db/schema";
import type { DeliveryProviderCode } from "@/lib/types";
import { decrypt } from "@/lib/crypto";
import { env } from "@/lib/env";
import { setOrderStatus, NEXT_STATUSES } from "@/server/orders";
import { ADAPTERS } from "./adapters";
import type { DeliveryStatus, ProviderConfig, ShipmentContext } from "./types";

export type { DeliveryStatus } from "./types";
export { normaliseStatus } from "./types";

/**
 * Adapter-based courier integration. bookDelivery creates a shipment with the tenant's chosen
 * aggregator (Jeebly, Quiqup, Careem Box, Aramex…) or "inhouse" (own drivers, no API), and stores
 * deliveryProvider/deliveryRef/deliveryTrackingUrl/deliveryStatus on the order.
 */
export interface BookingResult { provider: DeliveryProviderCode; ref: string; trackingUrl?: string; status: string }

export const DELIVERY_PROVIDERS: { code: DeliveryProviderCode; name: string; needsApiKey: boolean; keyHint?: string; accountHint?: string }[] = [
  { code: "inhouse", name: "In-house drivers", needsApiKey: false },
  { code: "jeebly", name: "Jeebly", needsApiKey: true, keyHint: "Jeebly API key", accountHint: "Client key" },
  { code: "quiqup", name: "Quiqup", needsApiKey: true, keyHint: "client_id:client_secret (or bearer token)" },
  { code: "careem_box", name: "Careem Box", needsApiKey: true, keyHint: "API token" },
  { code: "aramex", name: "Aramex", needsApiKey: true, keyHint: "username:password:accountPin:accountEntity", accountHint: "Account number" },
  { code: "manual", name: "Other / manual tracking", needsApiKey: false },
];

export const DELIVERY_STATUS_LABEL: Record<DeliveryStatus, string> = {
  created: "Booked", assigned: "Driver assigned", picked_up: "Picked up", in_transit: "In transit",
  out_for_delivery: "Out for delivery", delivered: "Delivered", failed: "Delivery failed", cancelled: "Cancelled",
};

export function providerConfig(tenant: Tenant, provider: DeliveryProviderCode): ProviderConfig {
  const p = tenant.settings.delivery?.providers?.[provider];
  const apiKey = decrypt(p?.apiKeyEnc);
  const needsKey = DELIVERY_PROVIDERS.find((d) => d.code === provider)?.needsApiKey ?? false;
  return {
    apiKey, accountId: p?.accountId, sandbox: p?.sandbox,
    fake: ["1", "true"].includes(process.env.DELIVERY_FAKE ?? "") || (needsKey && !apiKey && (p?.sandbox ?? true)),
  };
}

async function buildContext(tenant: Tenant, order: Order, cfg: ProviderConfig): Promise<ShipmentContext> {
  if (!order.deliveryAddress) throw new Error("Order has no delivery address");
  const loc = order.pickupLocationId
    ? await db.query.pickupLocations.findFirst({ where: eq(schema.pickupLocations.id, order.pickupLocationId) })
    : await db.query.pickupLocations.findFirst({ where: and(eq(schema.pickupLocations.tenantId, tenant.id), eq(schema.pickupLocations.active, true)) });
  const items = await db.query.orderItems.findMany({ where: eq(schema.orderItems.orderId, order.id) });
  const confidential = items.some((i) => i.kind === "confidential_document");
  return {
    tenant, order, cfg, dropoff: order.deliveryAddress,
    pickup: {
      name: tenant.name, phone: tenant.phone ?? tenant.whatsapp ?? "",
      address: loc?.address ?? tenant.address ?? "", emirate: loc?.emirate ?? tenant.emirate,
    },
    parcelCount: 1,
    description: confidential ? "Sealed documents – signature required" : `Printed goods (${items.length} item${items.length === 1 ? "" : "s"})`,
  };
}

export async function bookDelivery(tenant: Tenant, order: Order, provider?: DeliveryProviderCode): Promise<BookingResult> {
  if (order.fulfillment !== "delivery") throw new Error("Order is for pickup, not delivery");
  if (["pending_payment", "cancelled", "refunded"].includes(order.status)) throw new Error("Order must be paid before booking delivery");
  if (order.deliveryRef && order.deliveryStatus !== "cancelled" && order.deliveryStatus !== "failed") throw new Error("Delivery already booked");

  const code = provider ?? tenant.settings.delivery?.defaultProvider ?? "inhouse";
  const adapter = ADAPTERS[code];
  if (!adapter) throw new Error(`Unknown delivery provider ${code}`);
  const enabled = code === "inhouse" || code === "manual" || tenant.settings.delivery?.providers?.[code]?.enabled;
  if (!enabled) throw new Error(`${adapter.name} is not enabled for this store`);

  const cfg = providerConfig(tenant, code);
  const ctx = await buildContext(tenant, order, cfg);
  const r = await adapter.createShipment(ctx);
  const trackingUrl = r.trackingUrl ?? `${env.appUrl}/s/${tenant.slug}/orders/${order.id}`;

  await db.update(schema.orders).set({
    deliveryProvider: code, deliveryRef: r.ref, deliveryTrackingUrl: trackingUrl, deliveryStatus: r.status, updatedAt: new Date(),
  }).where(eq(schema.orders.id, order.id));
  await db.insert(schema.orderEvents).values({
    orderId: order.id, status: `delivery_${r.status}`,
    message: `Delivery booked with ${adapter.name}${cfg.fake ? " (simulated)" : ""} – ref ${r.ref}`,
  });
  return { provider: code, ref: r.ref, trackingUrl, status: r.status };
}

/**
 * Apply a normalised courier status to an order (webhook, polling or staff action for in-house drivers).
 * Moves the order status along where the transition is allowed.
 */
export async function applyDeliveryStatus(order: Order, status: DeliveryStatus, source: string, actorId?: string | null) {
  if (order.deliveryStatus === status) return order;
  await db.update(schema.orders).set({ deliveryStatus: status, updatedAt: new Date() }).where(eq(schema.orders.id, order.id));
  await db.insert(schema.orderEvents).values({ orderId: order.id, status: `delivery_${status}`, message: `${DELIVERY_STATUS_LABEL[status]} (${source})`, actorId: actorId ?? null });

  const target = status === "delivered" ? "delivered" : status === "out_for_delivery" || status === "picked_up" || status === "in_transit" ? "out_for_delivery" : null;
  if (target && order.status !== target) {
    // allow jumping from production states to out_for_delivery/delivered when the courier says so
    const path: Record<string, string[]> = { ...NEXT_STATUSES, paid: [...NEXT_STATUSES.paid, "out_for_delivery", "delivered"], in_production: [...NEXT_STATUSES.in_production, "out_for_delivery", "delivered"] };
    if (path[order.status]?.includes(target)) await setOrderStatus(order.id, target, `Courier update: ${DELIVERY_STATUS_LABEL[status]}`, actorId);
  }
  return db.query.orders.findFirst({ where: eq(schema.orders.id, order.id) });
}

/** Poll the courier for the latest status (admin "Refresh" button). */
export async function refreshDeliveryStatus(tenant: Tenant, order: Order) {
  if (!order.deliveryProvider || !order.deliveryRef) throw new Error("No delivery booked");
  const adapter = ADAPTERS[order.deliveryProvider];
  if (!adapter || order.deliveryProvider === "inhouse" || order.deliveryProvider === "manual") return order;
  const r = await adapter.getStatus(order.deliveryRef, providerConfig(tenant, order.deliveryProvider as DeliveryProviderCode));
  return applyDeliveryStatus(order, r.status, `${adapter.name} poll`);
}

export async function cancelDelivery(tenant: Tenant, order: Order) {
  if (!order.deliveryProvider || !order.deliveryRef) return;
  const adapter = ADAPTERS[order.deliveryProvider];
  await adapter?.cancel?.(order.deliveryRef, providerConfig(tenant, order.deliveryProvider as DeliveryProviderCode));
  await applyDeliveryStatus(order, "cancelled", "merchant");
}

/* ---------- webhook URL signing ---------- */
export function deliveryWebhookToken(tenantId: string, provider: string) {
  return createHmac("sha256", env.authSecret).update(`delivery:${tenantId}:${provider}`).digest("hex").slice(0, 32);
}
export function deliveryWebhookUrl(tenantId: string, provider: string) {
  return `${env.appUrl}/api/webhooks/delivery/${provider}/${tenantId}?token=${deliveryWebhookToken(tenantId, provider)}`;
}
export function verifyDeliveryWebhookToken(tenantId: string, provider: string, token: string | null) {
  if (!token) return false;
  const expected = deliveryWebhookToken(tenantId, provider);
  return token.length === expected.length && timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}
