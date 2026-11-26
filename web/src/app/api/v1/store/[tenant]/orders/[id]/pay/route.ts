import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getCustomer } from "@/lib/auth";
import { resolveTenant } from "@/lib/tenant";
import { enabledProviders } from "@/server/payments";
import { publicOrigin, startPayment, verifyOrderToken } from "@/server/checkout";

export const runtime = "nodejs";
const Body = z.object({ provider: z.literal("stripe").default("stripe"), t: z.string().optional() });

/** Retry payment for an order still awaiting payment. */
export async function POST(req: Request, { params }: { params: Promise<{ tenant: string; id: string }> }) {
  const p = await params;
  const tenant = await resolveTenant(p.tenant);
  if (!tenant || !z.string().uuid().safeParse(p.id).success) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const order = await db.query.orders.findFirst({ where: and(eq(schema.orders.id, p.id), eq(schema.orders.tenantId, tenant.id)) });
  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const customer = await getCustomer(tenant.id);
  if (!verifyOrderToken(order.id, body.data.t) && !(customer && order.customerId === customer.id))
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (order.status !== "pending_payment") return NextResponse.json({ error: "This order is already paid or closed." }, { status: 409 });
  if (!(await enabledProviders(tenant)).includes(body.data.provider)) return NextResponse.json({ error: "Payment method unavailable" }, { status: 400 });
  try {
    const { url } = await startPayment(tenant, order, body.data.provider, publicOrigin(req));
    return NextResponse.json({ url });
  } catch (e) {
    console.error("payment retry failed", e);
    return NextResponse.json({ error: "Payment page could not be opened. Please try again shortly." }, { status: 502 });
  }
}
