import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { env } from "@/lib/env";
import { getSubscriptionGateway, setupMode } from "@/server/billing/gateway";
import { currentOwner } from "@/server/trust/request";

export const dynamic = "force-dynamic";

/** Start (or restart / update) the card setup for the signed-in owner's shop. Card details are entered on the gateway's hosted page. */
export async function POST() {
  const owner = await currentOwner();
  if (!owner) return NextResponse.json({ error: "Sign in as the shop owner to add a card." }, { status: 401 });
  const tenant = await db.query.tenants.findFirst({ where: eq(schema.tenants.id, owner.tenantId) });
  if (!tenant || tenant.status === "cancelled") return NextResponse.json({ error: "Shop not found." }, { status: 404 });
  const mode = await setupMode();
  // real gateway first; the fake path is a separate, clearly labelled button
  if (!mode.live) return NextResponse.json({ mode: mode.fake ? "fake" : "unavailable", error: mode.fake ? undefined : "Card payments are not open yet." }, { status: mode.fake ? 200 : 503 });
  const gw = (await getSubscriptionGateway())!;
  try {
    const start = await gw.createSetup(tenant, { returnUrl: `${env.appUrl}/api/v1/billing/card/return`, cancelUrl: `${env.appUrl}/admin?card=cancelled` });
    if (start.kind === "redirect") return NextResponse.json({ mode: "redirect", url: start.url });
    return NextResponse.json({ mode: start.kind, error: start.kind === "unavailable" ? start.reason : undefined }, { status: start.kind === "unavailable" ? 503 : 200 });
  } catch (e) {
    console.error("card setup failed", e);
    return NextResponse.json({ error: "We could not reach the payment provider. Please try again in a moment." }, { status: 502 });
  }
}
