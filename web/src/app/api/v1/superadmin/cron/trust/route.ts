import { cronAuthorized } from "@/lib/cron-auth";
import { NextResponse } from "next/server";
import { purgeAbandonedSignups, runLicenceExpirySweep } from "@/server/trust/verification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Daily cron: mark expired trade licences, send the 30-day warning, remove signups that never added a card. Same secret as the other crons. */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const expiry = await runLicenceExpirySweep();
  const abandoned = await purgeAbandonedSignups();
  return NextResponse.json({ ok: true, ...expiry, abandonedSignupsRemoved: abandoned });
}
export const POST = GET;
