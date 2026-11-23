import { NextResponse } from "next/server";
import { CheckoutError, WalkInCheckoutInput, createWalkInOrder, orderToken, publicOrigin, startPayment, walkInStatusPath } from "@/server/checkout";
import { normalizePhone } from "@/lib/phone";
import { gateRequest, limited } from "../_gate";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ tenant: string }> }) {
  const g = await gateRequest((await params).tenant);
  if ("res" in g) return g.res;
  const { tenant } = g;
  const parsed = WalkInCheckoutInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  const phone = normalizePhone(parsed.data.phone);
  const rl = limited(req, "wi-checkout", 15, 600_000, phone ? { key: `phone:${phone}`, limit: 6 } : undefined);
  if (rl) return rl;

  let order;
  try { order = await createWalkInOrder(tenant, parsed.data); }
  catch (e) {
    if (e instanceof CheckoutError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("walk-in checkout failed", e);
    return NextResponse.json({ error: "Could not create your order. Please try again." }, { status: 500 });
  }
  const statusUrl = `${walkInStatusPath(tenant.slug, order.id)}?t=${orderToken(order.id)}`;
  try {
    const { url } = await startPayment(tenant, order, parsed.data.provider, publicOrigin(req), walkInStatusPath(tenant.slug, order.id));
    return NextResponse.json({ url, orderId: order.id, ticketNo: order.ticketNo, statusUrl });
  } catch (e) {
    console.error("walk-in payment start failed", e);
    // the order exists and is pending: the status page offers a "Pay now" retry
    return NextResponse.json({ error: "Payment page could not be opened. Your files are saved — you can pay from the next screen.", orderId: order.id, ticketNo: order.ticketNo, statusUrl }, { status: 502 });
  }
}
