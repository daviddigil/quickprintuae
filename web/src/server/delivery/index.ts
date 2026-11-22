import "server-only";
import type { Order, Tenant } from "@/db/schema";
import type { DeliveryProviderCode } from "@/lib/types";

/**
 * CONTRACT (implemented by the integrations agent):
 * Adapter-based courier integration. bookDelivery creates a shipment with the tenant's chosen
 * aggregator (Jeebly, Quiqup, Careem Box, Aramex…) or "inhouse" (own drivers, no API), and stores
 * deliveryProvider/deliveryRef/deliveryTrackingUrl/deliveryStatus on the order.
 */
export interface BookingResult { provider: DeliveryProviderCode; ref: string; trackingUrl?: string; status: string }

export const DELIVERY_PROVIDERS: { code: DeliveryProviderCode; name: string; needsApiKey: boolean }[] = [
  { code: "inhouse", name: "In-house drivers", needsApiKey: false },
  { code: "jeebly", name: "Jeebly", needsApiKey: true },
  { code: "quiqup", name: "Quiqup", needsApiKey: true },
  { code: "careem_box", name: "Careem Box", needsApiKey: true },
  { code: "aramex", name: "Aramex", needsApiKey: true },
  { code: "manual", name: "Other / manual tracking", needsApiKey: false },
];

export async function bookDelivery(_tenant: Tenant, _order: Order, _provider?: DeliveryProviderCode): Promise<BookingResult> {
  throw new Error("not implemented");
}
