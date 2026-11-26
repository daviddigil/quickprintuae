import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { resolveTenant } from "@/lib/tenant";
import { enabledProviders } from "@/server/payments";
import { publicOrigin, startPayment, verifyOrderToken, walkInStatusPath } from "@/server/checkout";
import { limited } from "../../../_gate";

export const runtime = "nodejs";
const Body = z.object({ provider: z.literal("stripe").default("stripe"), t: z.string() });

/** Retry payment for a walk-in order; returns to the walk-in status page afterwards. */
export async function POST(req: Request, { params }: { params: Promise<{ tenant: string; id: string }> }) {
  const p = await params;
  const tenant = await resolveTenant(p.tenant);
  if (!tenant || !z.string().uuid().safeParse(p.id).success) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const rl = limited(req, "wi-pay", 20, 600_000);
  if (rl) return rl;
  const order = await db.query.orders.findFirst({ where: and(eq(schema.orders.id, p.id), eq(schema.orders.tenantId, tenant.id), eq(schema.orders.source, "walk_in")) });
  if (!order || !verifyOrderToken(order.id, body.data.t)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (order.status !== "pending_payment") return NextResponse.json({ error: "This order is already paid or closed." }, { status: 409 });
  if (!(await enabledProviders(tenant)).includes(body.data.provider)) return NextResponse.json({ error: "Payment method unavailable" }, { status: 400 });
  try {
    const { url } = await startPayment(tenant, order, body.data.provider, publicOrigin(req), walkInStatusPath(tenant.slug, order.id));
    return NextResponse.json({ url });
  } catch (e) {
    console.error("walk-in payment retry failed", e);
    return NextResponse.json({ error: "Payment page could not be opened. Please try again shortly." }, { status: 502 });
  }
}
