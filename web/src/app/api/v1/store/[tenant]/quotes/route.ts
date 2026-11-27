import { NextResponse } from "next/server";
import { resolveTenant } from "@/lib/tenant";
import { submitQuote } from "@/server/quotes";
import { verifyTurnstile } from "@/server/captcha";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ tenant: string }> }) {
  const tenant = await resolveTenant((await params).tenant);
  if (!tenant || tenant.status === "suspended" || tenant.status === "cancelled") return NextResponse.json({ error: "Store not found" }, { status: 404 });
  const text = await req.text();
  if (text.length > 20_000) return NextResponse.json({ error: "Request too large" }, { status: 413 });
  let body: unknown = null;
  try { body = JSON.parse(text); } catch { /* handled by validation */ }
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  const token = body && typeof body === "object" ? (body as { captchaToken?: unknown }).captchaToken : undefined;
  const cap = await verifyTurnstile(typeof token === "string" ? token : null, ip === "unknown" ? null : ip);
  if (!cap.ok) return NextResponse.json({ error: cap.message }, { status: 400 });
  const r = await submitQuote(tenant, ip, body);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true });
}
