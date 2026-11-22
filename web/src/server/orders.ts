import "server-only";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import type { OrderStatus } from "@/lib/types";
import { deleteFile } from "./storage";

/** Allowed manual transitions in the admin panel. */
export const NEXT_STATUSES: Record<OrderStatus, OrderStatus[]> = {
  pending_payment: ["paid", "cancelled"],
  paid: ["in_production", "cancelled", "refunded"],
  in_production: ["ready", "cancelled"],
  ready: ["out_for_delivery", "picked_up", "delivered"],
  out_for_delivery: ["delivered", "ready"],
  delivered: ["refunded"],
  picked_up: ["refunded"],
  cancelled: [],
  refunded: [],
};

export async function setOrderStatus(orderId: string, status: OrderStatus, message?: string, actorId?: string | null) {
  const [o] = await db.update(schema.orders).set({ status, updatedAt: new Date() }).where(eq(schema.orders.id, orderId)).returning();
  await db.insert(schema.orderEvents).values({ orderId, status, message, actorId: actorId ?? null });
  if (o && ["delivered", "picked_up", "cancelled", "refunded"].includes(status)) await scheduleConfidentialPurge(o.id, o.tenantId);
  return o;
}

/**
 * Idempotent: called by payment webhooks and the return-URL verifier.
 * Returns true if this call transitioned the order to paid.
 */
export async function markOrderPaid(orderId: string, provider: "stripe" | "mamo", providerRef: string, raw?: unknown) {
  const order = await db.query.orders.findFirst({ where: eq(schema.orders.id, orderId) });
  if (!order || order.status !== "pending_payment") return false;
  await db.update(schema.payments).set({ status: "succeeded", raw: raw as object }).where(and(eq(schema.payments.orderId, orderId), eq(schema.payments.providerRef, providerRef)));
  await db.update(schema.orders).set({ status: "paid", paidAt: new Date(), paymentProvider: provider, updatedAt: new Date() }).where(eq(schema.orders.id, orderId));
  await db.insert(schema.orderEvents).values({ orderId, status: "paid", message: `Payment received via ${provider}` });
  return true;
}

/** Confidential files get a deleteAfter timestamp once the order is completed. */
async function scheduleConfidentialPurge(orderId: string, tenantId: string) {
  const t = await db.query.tenants.findFirst({ where: eq(schema.tenants.id, tenantId) });
  const hours = t?.settings?.confidentialRetentionHours ?? 72;
  await db.update(schema.files).set({ deleteAfter: new Date(Date.now() + hours * 3600_000) })
    .where(and(eq(schema.files.orderId, orderId), eq(schema.files.confidential, true), isNull(schema.files.deletedAt)));
}

/** Cron: physically delete confidential files past retention. */
export async function purgeExpiredFiles() {
  const due = await db.query.files.findMany({ where: (f, { lt, and, isNull }) => and(lt(f.deleteAfter, new Date()), isNull(f.deletedAt)) });
  for (const f of due) await deleteFile(f.storageKey);
  if (due.length) await db.update(schema.files).set({ deletedAt: new Date() }).where(inArray(schema.files.id, due.map((f) => f.id)));
  return due.length;
}
