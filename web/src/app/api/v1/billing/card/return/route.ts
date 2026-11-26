import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { env } from "@/lib/env";
import { liveGateway } from "@/server/billing/gateway";
import { completeCardSetup, markFailed } from "@/server/billing/gateway/setup";
import { currentOwner } from "@/server/trust/request";

export const dynamic = "force-dynamic";

/**
 * Return URL of the gateway's hosted card page. Confirms the setup right away (the webhook does the same, whichever comes first;
 * completing twice is harmless). The session must belong to the signed-in shop.
 */
export async function GET(req: Request) {
  const back = (q: string) => NextResponse.redirect(`${env.appUrl}/admin?${q}`, 303);
  const owner = await currentOwner();
  if (!owner) return NextResponse.redirect(`${env.appUrl}/login?next=/admin`, 303);
  const ref = new URL(req.url).searchParams.get("session_id");
  const gw = await liveGateway();
  if (!ref || !gw) return back("card=error");
  const tenant = await db.query.tenants.findFirst({ where: eq(schema.tenants.id, owner.tenantId) });
  if (!tenant) return back("card=error");
  try {
    const o = await gw.confirmSetup(tenant, ref);
    if (o.status === "pending") return back("card=pending");
    if (o.status === "failed") { await markFailed(tenant, o.reason.slice(0, 200)); return back("card=failed"); }
    const r = await completeCardSetup(tenant.id, o.card, { gateway: gw.code });
    if (!r.ok) return back(`card=${r.code}`);
    await gw.setDefaultCard?.(tenant, o.card);
    return back(r.started ? "welcome=1" : "card=updated");
  } catch (e) {
    console.error("card return failed", e);
    return back("card=error");
  }
}
