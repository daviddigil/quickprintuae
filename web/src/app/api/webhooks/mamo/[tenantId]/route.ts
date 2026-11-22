import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { timingSafeEqual } from "crypto";
import { db, schema } from "@/db";
import { decrypt } from "@/lib/crypto";
import { verifyMamo } from "@/server/payments/mamo";

export const runtime = "nodejs";

const safeEq = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * Mamo Pay webhook. The body is used only to find which payment link changed; payment status is
 * always re-fetched from the Mamo API (verifyMamo) before the order is marked paid.
 * If a webhook secret is set in admin, Mamo must send it in the Authorization header
 * (Mamo lets you set an auth header value when registering a webhook) or ?secret=.
 */
export async function POST(req: Request, { params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  const tenant = await db.query.tenants.findFirst({ where: eq(schema.tenants.id, tenantId) }).catch(() => undefined);
  if (!tenant) return NextResponse.json({ error: "unknown tenant" }, { status: 404 });

  const secret = decrypt(tenant.settings.payments?.mamo?.webhookSecretEnc);
  if (secret) {
    const got = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "") || new URL(req.url).searchParams.get("secret") || "";
    if (!safeEq(got, secret)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const payload = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const custom = (payload.custom_data ?? {}) as Record<string, unknown>;
  const linkId = String(payload.payment_link_id ?? payload.link_id ?? (payload.payment_link as Record<string, unknown> | undefined)?.id ?? "");

  let payment = linkId
    ? await db.query.payments.findFirst({ where: and(eq(schema.payments.provider, "mamo"), eq(schema.payments.providerRef, linkId), eq(schema.payments.tenantId, tenant.id)) })
    : undefined;
  if (!payment && typeof custom.order_id === "string") {
    payment = await db.query.payments.findFirst({ where: and(eq(schema.payments.provider, "mamo"), eq(schema.payments.orderId, custom.order_id), eq(schema.payments.tenantId, tenant.id)) });
  }
  if (!payment) return NextResponse.json({ received: true, matched: false });

  const order = await db.query.orders.findFirst({ where: eq(schema.orders.id, payment.orderId) });
  if (order && order.status === "pending_payment") {
    try { await verifyMamo(tenant, order, payment.providerRef); }
    catch (e) { console.error("[mamo] verify failed", e); return NextResponse.json({ error: "verify failed" }, { status: 502 }); }
  }
  return NextResponse.json({ received: true });
}
