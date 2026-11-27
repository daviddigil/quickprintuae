import { cronAuthorized } from "@/lib/cron-auth";
import { NextResponse } from "next/server";
import { purgeExpiredFiles } from "@/server/orders";
import { purgeOrphanUploads } from "@/server/uploads/orphans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Hourly cron: delete confidential uploads past their retention window, and uploads never attached to anything (24 h). */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const deleted = await purgeExpiredFiles();
  const orphans = await purgeOrphanUploads();
  return NextResponse.json({ ok: true, deleted, orphans });
}
