import { NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/db";
import { canonicalEmail } from "@/lib/trust/normalise";
import { rateLimit } from "@/server/billing/rate-limit";
import { clientIp } from "@/server/trust/request";

const Body = z.object({ email: z.string().trim().email().max(200), shopName: z.string().trim().max(80).optional(), phone: z.string().trim().max(30).optional(), locale: z.enum(["en", "ar"]).default("en") });

/** Pre-launch waitlist. Always answers the same way, so it cannot be used to find out who is already on the list. */
export async function POST(req: Request) {
  if (!rateLimit(`waitlist:${clientIp(req) ?? "local"}`, 10, 60 * 60_000)) return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 });
  const p = Body.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  await db.insert(schema.signupWaitlist).values({ email: p.data.email, emailCanonical: canonicalEmail(p.data.email), shopName: p.data.shopName || null, phone: p.data.phone || null, locale: p.data.locale }).onConflictDoNothing();
  return NextResponse.json({ ok: true });
}
