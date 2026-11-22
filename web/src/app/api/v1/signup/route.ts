import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { createSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { provisionTenant } from "@/server/provision";
import { rateLimit } from "@/server/billing/rate-limit";
import { RESERVED_SLUGS, SignupBody } from "./schema";

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!rateLimit(`signup:${ip}`, 5, 60 * 60_000))
    return NextResponse.json({ error: "Too many signups from this network. Try again later." }, { status: 429 });

  const parsed = SignupBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return NextResponse.json({ error: `${first.path.join(".")}: ${first.message}`, issues: parsed.error.issues }, { status: 400 });
  }
  const b = parsed.data;
  if (RESERVED_SLUGS.has(b.slug)) return NextResponse.json({ error: "This store address is reserved" }, { status: 409 });
  if (await db.query.tenants.findFirst({ where: eq(schema.tenants.slug, b.slug), columns: { id: true } }))
    return NextResponse.json({ error: "This store address is already taken" }, { status: 409 });

  try {
    const { tenant, owner } = await provisionTenant(db, {
      shopName: b.shopName, slug: b.slug, ownerName: b.ownerName, ownerEmail: b.email,
      ownerPassword: b.password, phone: b.phone, emirate: b.emirate, planCode: b.plan, trialDays: 14,
    });
    await createSession({ uid: owner.id, role: "owner", tid: tenant.id });
    await audit("tenant.signup", { slug: tenant.slug, plan: b.plan }, tenant.id);
    return NextResponse.json({ ok: true, redirect: "/admin?welcome=1", slug: tenant.slug });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes("unique") || msg.includes("duplicate")) return NextResponse.json({ error: "Store address already taken" }, { status: 409 });
    console.error("signup failed", e);
    return NextResponse.json({ error: "Could not create your store. Please try again." }, { status: 500 });
  }
}
