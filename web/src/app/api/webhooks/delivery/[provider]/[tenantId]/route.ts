import { NextResponse } from "next/server";
import { and, eq, or } from "drizzle-orm";
import { db, schema } from "@/db";
import type { DeliveryProviderCode } from "@/lib/types";
import { ADAPTERS } from "@/server/delivery/adapters";
import { pick } from "@/server/delivery/http";
import { applyDeliveryStatus, normaliseStatus, providerConfig, verifyDeliveryWebhookToken } from "@/server/delivery";

export const runtime = "nodejs";

/**
 * Courier status webhook: /api/webhooks/delivery/<provider>/<tenantId>?token=<signed token>
 * (admin shows the full URL to paste into the courier dashboard; also usable by an in-house driver app).
 * For API couriers the status is re-fetched from the provider when possible instead of trusting the body.
 */
export async function POST(req: Request, { params }: { params: Promise<{ provider: string; tenantId: string }> }) {
  const { provider, tenantId } = await params;
  if (!ADAPTERS[provider]) return NextResponse.json({ error: "unknown provider" }, { status: 404 });
  if (!verifyDeliveryWebhookToken(tenantId, provider, new URL(req.url).searchParams.get("token")))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const tenant = await db.query.tenants.findFirst({ where: eq(schema.tenants.id, tenantId) }).catch(() => undefined);
  if (!tenant) return NextResponse.json({ error: "unknown tenant" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const ref = String(pick(body, "ref", "awb", "awb_no", "AWB No", "id", "order_id", "data.id", "data.awb", "shipment_id", "tracking_number") ?? "");
  const partnerRef = String(pick(body, "partner_order_id", "reference", "customer_reference_number", "order_number") ?? "");
  if (!ref && !partnerRef) return NextResponse.json({ error: "missing reference" }, { status: 400 });

  const conds = [ref && eq(schema.orders.deliveryRef, ref), partnerRef && eq(schema.orders.number, partnerRef)].filter(Boolean) as ReturnType<typeof eq>[];
  const order = await db.query.orders.findFirst({
    where: and(eq(schema.orders.tenantId, tenant.id), eq(schema.orders.deliveryProvider, provider), or(...conds)),
  });
  if (!order) return NextResponse.json({ received: true, matched: false });

  let status = normaliseStatus(pick(body, "status", "state", "data.status", "event", "UpdateCode"));
  if (provider !== "inhouse" && provider !== "manual" && order.deliveryRef) {
    try {
      const cfg = providerConfig(tenant, provider as DeliveryProviderCode);
      if (!cfg.fake) status = (await ADAPTERS[provider].getStatus(order.deliveryRef, cfg)).status;
    } catch (e) {
      console.warn(`[delivery] ${provider} status refetch failed, using webhook body`, e);
    }
  }
  await applyDeliveryStatus(order, status, `${provider} webhook`);
  return NextResponse.json({ received: true, status });
}
