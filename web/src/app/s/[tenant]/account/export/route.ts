import { NextResponse } from "next/server";
import { getCustomer } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { resolveTenant } from "@/lib/tenant";
import { exportCustomerData } from "@/server/privacy";

export const dynamic = "force-dynamic";

/** "Download my data": JSON of the signed-in customer's own data in THIS shop only. */
export async function GET(_req: Request, { params }: { params: Promise<{ tenant: string }> }) {
  const tenant = await resolveTenant((await params).tenant);
  if (!tenant) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const customer = await getCustomer(tenant.id);
  if (!customer) return NextResponse.json({ error: "Please sign in" }, { status: 401 });
  const data = await exportCustomerData(tenant.id, customer.id);
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await audit("privacy.export", { userId: customer.id, self: true }, tenant.id);
  return new NextResponse(JSON.stringify(data, null, 2), { headers: { "content-type": "application/json", "content-disposition": `attachment; filename="my-data-${tenant.slug}.json"`, "cache-control": "no-store" } });
}
