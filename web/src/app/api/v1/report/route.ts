import { NextResponse } from "next/server";
import { rateLimitAsync } from "@/server/billing/rate-limit";
import { verifyTurnstile } from "@/server/captcha";
import { ReportInput, createReport } from "@/server/reports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public content report / takedown request. Rate limited per IP, Turnstile when configured, honeypot field `website`. */
export async function POST(req: Request) {
  const text = await req.text();
  if (text.length > 20_000) return NextResponse.json({ error: "Request too large" }, { status: 413 });
  let body: unknown = null;
  try { body = JSON.parse(text); } catch { /* validated below */ }
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  if (!(await rateLimitAsync(`report:${ip}`, 5, 60 * 60_000))) return NextResponse.json({ error: "Too many reports. Please try again later." }, { status: 429 });
  const parsed = ReportInput.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Please check the form" }, { status: 400 });
  if (parsed.data.website) return NextResponse.json({ ok: true }); // honeypot: pretend success, store nothing
  const cap = await verifyTurnstile(parsed.data.turnstileToken ?? null, ip === "unknown" ? null : ip);
  if (!cap.ok) return NextResponse.json({ error: cap.message }, { status: 400 });
  await createReport(parsed.data);
  return NextResponse.json({ ok: true });
}
