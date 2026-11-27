import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { createSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { GuardError } from "@/lib/trust/verification";
import { provisionTenant } from "@/server/provision";
import { rateLimit } from "@/server/billing/rate-limit";
import { setupMode } from "@/server/billing/gateway";
import { assertSignupAllowed, guardErrorFromDb, recordSignupIp } from "@/server/trust/guards";
import { clientIp } from "@/server/trust/request";
import { findOfferForSignup, OFFER_FAILURE_MESSAGE } from "@/server/offers";
import { LEGAL_VERSION, SIGNUP_ACCEPT_KEYS } from "@/lib/legal";
import { recordLegalAcceptance } from "@/server/legal";
import { verifyTurnstile } from "@/server/captcha";
import { RESERVED_SLUGS, SignupBody, isLegalAccepted } from "./schema";

/**
 * Step 1 of signup: account details. Creates the shop as 'incomplete' (no trial yet) and signs the owner in.
 * Step 2 (card) starts the free trial (length: platform_settings trialDays): see /api/v1/billing/card/*.
 */
export async function POST(req: Request) {
  const ip = clientIp(req) ?? "local";
  if (!rateLimit(`signup:${ip}`, 5, 60 * 60_000))
    return NextResponse.json({ error: "Too many signups from this network. Try again later." }, { status: 429 });

  const mode = await setupMode();
  if (!mode.open) return NextResponse.json({ error: "We are opening soon. Join the waitlist and we will email you.", waitlist: true }, { status: 503 });

  const parsed = SignupBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return NextResponse.json({ error: `${first.path.join(".")}: ${first.message}`, issues: parsed.error.issues }, { status: 400 });
  }
  const b = parsed.data;
  // legal acceptance is mandatory (checked before anything is created)
  if (!isLegalAccepted(b.acceptLegal)) return NextResponse.json({ error: "Please accept the Terms, Privacy Policy and Seller Agreement to create your store.", code: "legal_required" }, { status: 400 });
  const captcha = await verifyTurnstile(b.captchaToken, ip === "local" ? null : ip);
  if (!captcha.ok) return NextResponse.json({ error: captcha.message, code: "captcha_failed" }, { status: 400 });
  if (RESERVED_SLUGS.has(b.slug)) return NextResponse.json({ error: "This store address is reserved" }, { status: 409 });
  if (await db.query.tenants.findFirst({ where: eq(schema.tenants.slug, b.slug), columns: { id: true } }))
    return NextResponse.json({ error: "This store address is already taken" }, { status: 409 });

  // promo code (or the running campaign): validated now, redeemed only when the card step completes
  const offer = await findOfferForSignup({ planCode: b.plan, cycle: "monthly", code: b.promoCode || null });
  if (!offer.ok && b.promoCode) return NextResponse.json({ error: OFFER_FAILURE_MESSAGE[offer.reason], code: "offer_" + offer.reason }, { status: 400 });

  try {
    await assertSignupAllowed({ email: b.email, phone: b.phone });
    const { tenant, owner } = await provisionTenant(db, {
      shopName: b.shopName, slug: b.slug, ownerName: b.ownerName, ownerEmail: b.email,
      ownerPassword: b.password, phone: b.phone, emirate: b.emirate, planCode: b.plan, incomplete: true,
    });
    if (offer.ok) await db.update(schema.tenants).set({ billingRef: { ...tenant.billingRef, pendingOffer: offer.offer.id } }).where(eq(schema.tenants.id, tenant.id));
    await createSession({ uid: owner.id, role: "owner", tid: tenant.id });
    await recordLegalAcceptance({ tenantId: tenant.id, userId: owner.id, ip: ip === "local" ? null : ip, userAgent: req.headers.get("user-agent") });
    await audit("tenant.signup", { slug: tenant.slug, plan: b.plan }, tenant.id);
    await audit("legal.accepted", { documents: SIGNUP_ACCEPT_KEYS, version: LEGAL_VERSION, via: "signup" }, tenant.id);
    await recordSignupIp(tenant.id, ip === "local" ? null : ip);
    return NextResponse.json({ ok: true, slug: tenant.slug, next: "card", fake: mode.fake, live: mode.live?.code ?? null });
  } catch (e) {
    const g = e instanceof GuardError ? e : guardErrorFromDb(e);
    if (g) return NextResponse.json({ error: g.message, code: g.code }, { status: 409 });
    const msg = (e as Error).message;
    if (msg.includes("unique") || msg.includes("duplicate")) return NextResponse.json({ error: "Store address already taken" }, { status: 409 });
    console.error("signup failed", e);
    return NextResponse.json({ error: "Could not create your store. Please try again." }, { status: 500 });
  }
}
