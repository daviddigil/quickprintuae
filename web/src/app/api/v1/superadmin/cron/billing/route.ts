import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { runBillingCron } from "@/server/billing";

/** Schedule daily: GET /api/v1/superadmin/cron/billing?secret=$CRON_SECRET (or header x-cron-secret). */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret = url.searchParams.get("secret") ?? req.headers.get("x-cron-secret");
  if (secret !== env.cronSecret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = await runBillingCron();
  return NextResponse.json({ ok: true, ...result });
}
