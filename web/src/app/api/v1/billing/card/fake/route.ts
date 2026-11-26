import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { setupMode } from "@/server/billing/gateway";
import { completeCardSetup } from "@/server/billing/gateway/setup";
import { currentOwner } from "@/server/trust/request";

export const dynamic = "force-dynamic";

/** TEST MODE ONLY (PAYMENTS_FAKE=1 or local development): completes the card step without any gateway. 404 everywhere else. */
export async function POST(req: Request) {
  const mode = await setupMode();
  if (!mode.fake) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const owner = await currentOwner();
  if (!owner) return NextResponse.json({ error: "Sign in as the shop owner." }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { cardId?: string };
  // a distinct fake card per shop unless the caller names one (lets tests prove "same card, second trial" is refused)
  const variant = (typeof body.cardId === "string" && /^[\w-]{1,40}$/.test(body.cardId) ? body.cardId : owner.tenantId);
  const r = await completeCardSetup(owner.tenantId, { paymentMethodId: `pm_test_${variant}`, brand: "visa", last4: "4242", expMonth: 12, expYear: new Date().getUTCFullYear() + 3, fingerprint: `fake:${variant}` }, { gateway: "fake" });
  if (!r.ok) return NextResponse.json({ error: r.message, code: r.code }, { status: 409 });
  await audit("billing.test_card", { started: r.started }, owner.tenantId);
  return NextResponse.json({ ok: true, started: r.started, redirect: "/admin?welcome=1" });
}
