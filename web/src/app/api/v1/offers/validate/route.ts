import { NextResponse } from "next/server";
import { z } from "zod";
import { findOfferForSignup, OFFER_FAILURE_MESSAGE } from "@/server/offers";
import { rateLimit } from "@/server/billing/rate-limit";
import { clientIp } from "@/server/trust/request";
import { describeOffer } from "@/lib/offers";

const Body = z.object({ code: z.string().trim().max(40).optional(), plan: z.string().trim().max(40), cycle: z.enum(["monthly", "yearly"]).default("monthly") });

/**
 * Public: what would this promo code (or the running campaign) give a new shop on this plan?
 * Rate limited per IP; answers are generic and never reveal other codes. Nothing is redeemed here.
 */
export async function POST(req: Request) {
  const ip = clientIp(req) ?? "local";
  if (!rateLimit(`offer-validate:${ip}`, 30, 10 * 60_000)) return NextResponse.json({ ok: false, reason: "rate", error: "Too many attempts. Please wait a minute and try again." }, { status: 429 });
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ ok: false, reason: "invalid", error: OFFER_FAILURE_MESSAGE.invalid }, { status: 400 });
  const { code, plan, cycle } = parsed.data;
  const r = await findOfferForSignup({ planCode: plan, cycle, code: code || null });
  if (!r.ok) {
    // no code typed and no campaign running: not an error, just nothing to show
    if (!code) return NextResponse.json({ ok: true, offer: null });
    return NextResponse.json({ ok: false, reason: r.reason, error: OFFER_FAILURE_MESSAGE[r.reason] });
  }
  const o = r.offer;
  return NextResponse.json({
    ok: true, auto: r.auto,
    offer: { id: o.id, name: o.name, kind: o.kind, value: o.value, durationMonths: o.durationMonths, text: describeOffer(o), list: r.list, discounted: r.discounted, discount: r.discount, cycle: r.cycle },
  });
}
