import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { env } from "@/lib/env";
import { sendEmail } from "./index";
import { orderConfirmationEmail } from "./order-email";
import { getSellerIdentity } from "@/server/seller-identity";

/** Best-effort order confirmation email after payment (never throws). Walk-in orders have no real email and are skipped. */
export async function sendOrderConfirmation(orderId: string): Promise<void> {
  try {
    const order = await db.query.orders.findFirst({ where: eq(schema.orders.id, orderId) });
    if (!order || order.source === "walk_in" || order.customerEmail.endsWith("@invalid")) return;
    const tenant = await db.query.tenants.findFirst({ where: eq(schema.tenants.id, order.tenantId) });
    if (!tenant) return;
    const { orderToken } = await import("@/server/checkout");
    const url = `${env.appUrl.replace(/\/$/, "")}/s/${tenant.slug}/orders/${order.id}?t=${orderToken(order.id)}`;
    const msg = orderConfirmationEmail({
      shopName: tenant.name, customerName: order.customerName, orderNumber: order.number, total: order.total, vat: order.vat,
      seller: await getSellerIdentity(tenant), returnsPolicy: tenant.returnsPolicy, url,
    });
    await sendEmail({ to: order.customerEmail, tag: "order.confirmation", ...msg });
  } catch (e) { console.error("order confirmation email failed", e); }
}
