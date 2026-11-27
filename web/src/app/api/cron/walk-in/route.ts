import { cronAuthorized } from "@/lib/cron-auth";
import { NextResponse } from "next/server";
import { and, inArray, isNull, lt } from "drizzle-orm";
import { db, schema } from "@/db";
import { purgeExpiredFiles } from "@/server/orders";
import { deleteFile } from "@/server/storage";
import { sweepStale } from "@/server/walk-in/queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ORPHAN_HOURS = 6;

/** Hourly: recover stale print claims, drop abandoned uploads (never attached to an order), enforce retention timers. */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const tenants = await db.select({ id: schema.tenants.id }).from(schema.tenants);
  for (const t of tenants) await sweepStale(t.id);

  const orphans = await db.select().from(schema.files)
    .where(and(isNull(schema.files.orderId), isNull(schema.files.deletedAt), lt(schema.files.createdAt, new Date(Date.now() - ORPHAN_HOURS * 3600_000))));
  for (const f of orphans) await deleteFile(f.storageKey);
  if (orphans.length) await db.update(schema.files).set({ deletedAt: new Date() }).where(inArray(schema.files.id, orphans.map((f) => f.id)));

  const purged = await purgeExpiredFiles();
  return NextResponse.json({ ok: true, tenants: tenants.length, orphansDeleted: orphans.length, retentionPurged: purged });
}
