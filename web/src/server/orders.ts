import "server-only";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import type { OrderStatus } from "@/lib/types";
import { deleteFile } from "./storage";
import { withoutHeld } from "./retention";

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
  if (o && ["cancelled", "refunded"].includes(status)) {
    await (await import("@/server/commission")).reverseOrderCommission(o.id).catch((e) => console.error("commission reversal failed", e));
    // a paid order that is refunded/cancelled: post a reversing (negative) ledger row so the shop's payout is reduced
    if (o.paidAt) await (await import("@/server/payouts/ledger")).applyRefund(o.id, o.total).catch((e) => console.error("ledger refund failed", e));
    // tax: a credit note (sequential per shop, idempotent) for the paid order that was refunded or cancelled after payment
    if (o.paidAt) await (await import("@/server/credit-notes")).issueOrderCreditNote(o.id, o.total, message ?? `Order ${status}`).catch((e) => console.error("credit note failed", e));
  }
  return o;
}

/**
 * Idempotent: called by payment webhooks and the return-URL verifier.
 * Returns true if this call transitioned the order to paid.
 */
export async function markOrderPaid(orderId: string, provider: "stripe", providerRef: string, raw?: unknown, opts: { gatewayFee?: number } = {}) {
  const order = await db.query.orders.findFirst({ where: eq(schema.orders.id, orderId) });
  if (!order || order.status !== "pending_payment") return false;
  await db.update(schema.payments).set({ status: "succeeded", raw: raw as object }).where(and(eq(schema.payments.orderId, orderId), eq(schema.payments.providerRef, providerRef)));
  await db.update(schema.orders).set({ status: "paid", paidAt: new Date(), paymentProvider: provider, updatedAt: new Date() }).where(eq(schema.orders.id, orderId));
  await db.insert(schema.orderEvents).values({ orderId, status: "paid", message: `Payment received via ${provider}` });
  // the platform's commission on this order, priced with the shop's terms at the moment it was paid (never blocks the payment)
  await (await import("@/server/commission")).recordOrderCommission(orderId).catch((e) => console.error("commission record failed", e));
  // the payout ledger: gross, gateway fee, commission (netted) and what the shop is owed (cron backfills if this fails)
  await (await import("@/server/payouts/ledger")).recordSettlementForOrder(orderId, { provider, providerRef, gatewayFee: opts.gatewayFee }).catch((e) => console.error("settlement record failed", e));
  // confirmation email with the verified seller identity and the shop's consumer terms (best effort)
  if (order.source !== "walk_in") void import("@/server/email/order-confirmation").then((m) => m.sendOrderConfirmation(orderId)).catch(() => {});
  // walk-in QR orders: payment is what releases their files into the print queue
  if (order.source === "walk_in") await (await import("@/server/walk-in/queue")).enqueueOrderJobs(orderId);
  return true;
}

/** Confidential files get a deleteAfter timestamp once the order is completed. */
async function scheduleConfidentialPurge(orderId: string, tenantId: string) {
  const t = await db.query.tenants.findFirst({ where: eq(schema.tenants.id, tenantId) });
  const hours = t?.settings?.confidentialRetentionHours ?? 72;
  await db.update(schema.files).set({ deleteAfter: new Date(Date.now() + hours * 3600_000) })
    .where(and(eq(schema.files.orderId, orderId), eq(schema.files.confidential, true), isNull(schema.files.deletedAt)));
}

/** Cron: physically delete confidential files past retention (skips legal-hold orders and shops). */
export async function purgeExpiredFiles() {
  // legal hold: files of a held order / held shop are skipped (they are purged on a later run once the hold is lifted)
  const due = await withoutHeld(await db.query.files.findMany({ where: (f, { lt, and, isNull }) => and(lt(f.deleteAfter, new Date()), isNull(f.deletedAt)) }));
  for (const f of due) await deleteFile(f.storageKey);
  if (due.length) await db.update(schema.files).set({ deletedAt: new Date() }).where(inArray(schema.files.id, due.map((f) => f.id)));
  return due.length;
}
