import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { rateLimit } from "@/server/billing/rate-limit";
import { logConsent } from "@/server/consent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Logs the cookie-notice decision for a signed-in user. Anonymous visitors only get the first-party cookie (nothing stored server-side). */
export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!rateLimit(`consent:${ip}`, 30, 60 * 60_000)) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const body = (await req.json().catch(() => null)) as { analytics?: unknown } | null;
  const cu = await getCurrentUser();
  if (!cu) return NextResponse.json({ ok: true, logged: false });
  await logConsent({ tenantId: cu.session.tid ?? null, userId: cu.user.id, purpose: "cookies_analytics", granted: body?.analytics === true, ip: ip === "unknown" ? null : ip });
  return NextResponse.json({ ok: true, logged: true });
}
