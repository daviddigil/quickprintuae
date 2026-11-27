import { cronAuthorized } from "@/lib/cron-auth";
import { NextResponse } from "next/server";
import { backfillSettlements, promoteAvailable } from "@/server/payouts/ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Hourly cron: ledger rows whose hold period has passed become available; paid orders missing a ledger row get one. */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const backfilled = await backfillSettlements();
  const promoted = await promoteAvailable();
  return NextResponse.json({ ok: true, promoted, backfilled });
}
