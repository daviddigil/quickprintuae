import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { purgeAbandonedSignups, runLicenceExpirySweep } from "@/server/trust/verification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Daily cron: mark expired trade licences, send the 30-day warning, remove signups that never added a card. Same secret as the other crons. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret = url.searchParams.get("secret") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (secret !== env.cronSecret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const expiry = await runLicenceExpirySweep();
  const abandoned = await purgeAbandonedSignups();
  return NextResponse.json({ ok: true, ...expiry, abandonedSignupsRemoved: abandoned });
}
export const POST = GET;
