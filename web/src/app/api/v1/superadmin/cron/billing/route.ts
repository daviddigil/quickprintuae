import { cronAuthorized } from "@/lib/cron-auth";
import { NextResponse } from "next/server";
import { runBillingCron } from "@/server/billing";

/** Schedule daily: GET /api/v1/superadmin/cron/billingwith header "Authorization: Bearer $CRON_SECRET". */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = await runBillingCron();
  return NextResponse.json({ ok: true, ...result });
}
