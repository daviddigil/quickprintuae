import { NextResponse } from "next/server";
import { getCustomer } from "@/lib/auth";
import { resolveTenant } from "@/lib/tenant";
import { CheckoutError, CheckoutInput, createOrder, orderToken, publicOrigin, startPayment } from "@/server/checkout";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ tenant: string }> }) {
  const tenant = await resolveTenant((await params).tenant);
  if (!tenant) return NextResponse.json({ error: "Store not found" }, { status: 404 });
  const parsed = CheckoutInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json({ error: `Please check ${issue?.path.join(".") || "your details"}: ${issue?.message ?? "invalid"}` }, { status: 400 });
  }
  const customer = await getCustomer(tenant.id);
  let order;
  try {
    order = await createOrder(tenant, parsed.data, customer?.id ?? null);
  } catch (e) {
    if (e instanceof CheckoutError) return NextResponse.json(e.code ? { error: e.code, message: e.message } : { error: e.message }, { status: e.status });
    console.error("checkout failed", e);
    return NextResponse.json({ error: "Could not place your order. Please try again." }, { status: 500 });
  }
  const orderUrl = `/s/${tenant.slug}/orders/${order.id}?t=${orderToken(order.id)}`;
  try {
    const { url } = await startPayment(tenant, order, parsed.data.provider, publicOrigin(req));
    return NextResponse.json({ url, orderId: order.id, number: order.number, orderUrl });
  } catch (e) {
    console.error("payment start failed", e);
    return NextResponse.json({
      error: "Your order was saved but the payment page could not be opened. You can retry payment from your order page.",
      orderId: order.id, orderUrl,
    }, { status: 502 });
  }
}
