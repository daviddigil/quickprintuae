import { cronAuthorized } from "@/lib/cron-auth";
import { NextResponse } from "next/server";
import { db, schema } from "@/db";
import { purgeExpiredFiles } from "@/server/orders";
import { purgeOrphanUploads } from "@/server/uploads/orphans";
import { sweepStale } from "@/server/walk-in/queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Hourly: recover stale print claims, drop abandoned uploads (never attached to an order), enforce retention timers. */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const tenants = await db.select({ id: schema.tenants.id }).from(schema.tenants);
  for (const t of tenants) await sweepStale(t.id);

  // ONE safe orphan purge (never touches files referenced by orders, quotes, print jobs or verification documents)
  const orphansDeleted = await purgeOrphanUploads();

  const purged = await purgeExpiredFiles();
  return NextResponse.json({ ok: true, tenants: tenants.length, orphansDeleted, retentionPurged: purged });
}
