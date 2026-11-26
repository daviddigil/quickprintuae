import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { backfillSettlements, promoteAvailable } from "@/server/payouts/ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Hourly cron: ledger rows whose hold period has passed become available; paid orders missing a ledger row get one. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret = url.searchParams.get("secret") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (secret !== env.cronSecret) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const backfilled = await backfillSettlements();
  const promoted = await promoteAvailable();
  return NextResponse.json({ ok: true, promoted, backfilled });
}
