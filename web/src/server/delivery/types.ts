import type { Order, Tenant } from "@/db/schema";
import type { Address, DeliveryProviderCode } from "@/lib/types";

/** Normalised courier status across all providers. */
export type DeliveryStatus =
  | "created" | "assigned" | "picked_up" | "in_transit" | "out_for_delivery" | "delivered" | "failed" | "cancelled";

export interface ProviderConfig {
  apiKey?: string;      // decrypted
  accountId?: string;
  sandbox?: boolean;
  /** simulate API calls (no credentials / DELIVERY_FAKE=1) */
  fake: boolean;
}

export interface ShipmentContext {
  tenant: Tenant;
  order: Order;
  pickup: { name: string; phone: string; address: string; emirate: string };
  dropoff: Address;
  parcelCount: number;
  description: string;
  cfg: ProviderConfig;
}

export interface ShipmentResult { ref: string; trackingUrl?: string; status: DeliveryStatus; fee?: number; raw?: unknown }
export interface StatusResult { status: DeliveryStatus; trackingUrl?: string; raw?: unknown }

export interface DeliveryAdapter {
  code: DeliveryProviderCode;
  name: string;
  quote?(ctx: ShipmentContext): Promise<{ fee: number; currency: "AED"; etaHours?: number }>;
  createShipment(ctx: ShipmentContext): Promise<ShipmentResult>;
  getStatus(ref: string, cfg: ProviderConfig): Promise<StatusResult>;
  cancel?(ref: string, cfg: ProviderConfig): Promise<void>;
}

/** Map arbitrary provider status strings onto our normalised set. */
export function normaliseStatus(raw: unknown): DeliveryStatus {
  const s = String(raw ?? "").toLowerCase().replace(/[\s-]+/g, "_");
  if (/(cancel|void)/.test(s)) return "cancelled";
  if (/(fail|return|undeliver|reject|exception)/.test(s)) return "failed";
  if (/^(delivered|completed|complete|done|success)/.test(s) || s === "delivered") return "delivered";
  if (/(out_for_delivery|ofd|on_the_way|en_route)/.test(s)) return "out_for_delivery";
  if (/(transit|dispatch|shipped|hub)/.test(s)) return "in_transit";
  if (/(picked|collected|pickup_done)/.test(s)) return "picked_up";
  if (/(assign|accepted|allocated|driver)/.test(s)) return "assigned";
  return "created";
}
