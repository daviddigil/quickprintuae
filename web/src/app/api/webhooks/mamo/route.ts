import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "crypto";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getPlatformGateway } from "@/server/payments/platform";
import { claimWebhookEvent, releaseWebhookEvent } from "@/server/payments/webhook-events";
import { fetchMamoCharge, verifyMamo } from "@/server/payments/mamo";
import { applyRefund } from "@/server/payouts/ledger";
import { setOrderStatus } from "@/server/orders";

export const runtime = "nodejs";

const safeEq = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
type Json = Record<string, unknown>;

/**
 * The PLATFORM Mamo Pay webhook (register https://<app>/api/webhooks/mamo in the Mamo dashboard with the auth header value
 * set to the webhook secret saved on /superadmin/gateways). The body only tells us WHICH payment link changed: the status is always
 * re-fetched from the Mamo API before an order is marked paid, and every event is processed once.
 */
export async function POST(req: Request) {
  const g = await getPlatformGateway("mamo");
  if (!g.secretKey || !g.webhookSecret) return NextResponse.json({ error: "Mamo webhook is not configured" }, { status: 503 });
  const got = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "") || new URL(req.url).searchParams.get("secret") || "";
  if (!safeEq(got, g.webhookSecret)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const raw = await req.text();
  let payload: Json = {};
  try { payload = raw ? (JSON.parse(raw) as Json) : {}; } catch { return NextResponse.json({ error: "bad body" }, { status: 400 }); }
  const eventId = String(payload.id ?? payload.event_id ?? createHash("sha256").update(raw).digest("hex"));
  const type = String(payload.event_type ?? payload.type ?? payload.event ?? "");
  if (!(await claimWebhookEvent("mamo", eventId, type))) return NextResponse.json({ received: true, duplicate: true });

  try {
    const custom = (payload.custom_data ?? {}) as Json;
    const linkId = String(payload.payment_link_id ?? payload.link_id ?? (payload.payment_link as Json | undefined)?.id ?? "");
    let payment = linkId ? await db.query.payments.findFirst({ where: and(eq(schema.payments.provider, "mamo"), eq(schema.payments.providerRef, linkId)) }) : undefined;
    if (!payment && typeof custom.order_id === "string") payment = await db.query.payments.findFirst({ where: and(eq(schema.payments.provider, "mamo"), eq(schema.payments.orderId, custom.order_id)) });
    if (!payment) return NextResponse.json({ received: true, matched: false });
    // metadata sent when the link was created must agree with our own record
    if (typeof custom.tenant_id === "string" && custom.tenant_id !== payment.tenantId) return NextResponse.json({ received: true, matched: false });

    const order = await db.query.orders.findFirst({ where: eq(schema.orders.id, payment.orderId) });
    const tenant = order ? await db.query.tenants.findFirst({ where: eq(schema.tenants.id, order.tenantId) }) : null;
    if (!order || !tenant) return NextResponse.json({ received: true, matched: false });

    if (/refund/i.test(type) && order.paidAt) {
      // refund amount from the (re-fetched) charge when Mamo reports it; otherwise treat as a full refund
      const chargeId = String(payload.charge_id ?? payload.id ?? "");
      let amount = Number(payload.refund_amount ?? payload.refunded_amount ?? NaN);
      if (!Number.isFinite(amount) && chargeId) { try { const c = await fetchMamoCharge(chargeId); amount = Number(c.refund_amount ?? c.refunded_amount ?? NaN); } catch { /* fall back to full */ } }
      if (!Number.isFinite(amount) || amount >= order.total) { if (order.status !== "refunded") await setOrderStatus(order.id, "refunded", "Refunded via Mamo Pay"); }
      else await applyRefund(order.id, amount);
    } else if (order.status === "pending_payment") {
      await verifyMamo(tenant, order, payment.providerRef);
    }
    return NextResponse.json({ received: true });
  } catch (e) {
    await releaseWebhookEvent("mamo", eventId).catch(() => {});
    console.error("[mamo webhook] failed", e);
    return NextResponse.json({ error: "processing failed" }, { status: 502 });
  }
}
