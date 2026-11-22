import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { purgeExpiredFiles } from "@/server/orders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Hourly cron: delete confidential uploads past their retention window. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret = url.searchParams.get("secret") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (secret !== env.cronSecret) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const deleted = await purgeExpiredFiles();
  return NextResponse.json({ ok: true, deleted });
}
