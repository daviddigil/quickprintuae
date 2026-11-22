import Link from "next/link";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { getCustomer } from "@/lib/auth";
import { requireStorefrontTenant } from "@/lib/tenant";
import { formatAED } from "@/lib/pricing";
import { formatUaeDateTime } from "@/lib/slots";
import { ORDER_STATUS_LABEL, type OrderStatus } from "@/lib/types";
import { Badge, Card, EmptyState, ORDER_STATUS_TONE } from "@/components/ui";
import { AccountAuth } from "@/components/store/account-auth";
import { orderToken } from "@/server/checkout";

export const metadata = { title: "My account" };
export const dynamic = "force-dynamic";

export default async function AccountPage({ params }: { params: Promise<{ tenant: string }> }) {
  const tenant = await requireStorefrontTenant((await params).tenant);
  const customer = await getCustomer(tenant.id);
  const base = `/s/${tenant.slug}`;
  if (!customer) {
    return <div className="px-4 py-12"><h1 className="mb-6 text-center text-2xl font-bold">My account</h1><AccountAuth store={tenant.slug} /></div>;
  }
  const orders = await db.select().from(schema.orders)
    .where(and(eq(schema.orders.tenantId, tenant.id), eq(schema.orders.customerId, customer.id))).orderBy(desc(schema.orders.createdAt)).limit(50);
  const items = orders.length ? await db.select().from(schema.orderItems).where(inArray(schema.orderItems.orderId, orders.map((o) => o.id))) : [];
  const products = await db.select({ id: schema.products.id, slug: schema.products.slug, active: schema.products.active }).from(schema.products).where(eq(schema.products.tenantId, tenant.id));
  const slugById = new Map(products.filter((p) => p.active).map((p) => [p.id, p.slug]));
  const reorderHref = (it: (typeof items)[number]) => {
    const slug = it.productId && slugById.get(it.productId);
    if (!slug) return null;
    const cfg = Buffer.from(JSON.stringify({ selections: it.selections, quantity: it.quantity, pages: it.pages })).toString("base64url");
    return `${base}/p/${slug}?cfg=${cfg}`;
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><h1 className="text-2xl font-bold">Hi, {customer.name.split(" ")[0]}</h1><p className="text-sm text-slate-500">{customer.email}{customer.phone ? ` · ${customer.phone}` : ""}</p></div>
        <a href={`/logout?next=${base}`} className="text-sm font-medium text-slate-600 hover:text-slate-900">Sign out</a>
      </div>
      <h2 className="mb-3 mt-8 text-lg font-semibold">Your orders</h2>
      {orders.length === 0 ? (
        <Card><EmptyState title="No orders yet"><Link href={base} className="text-store mt-2 inline-block font-medium">Start printing →</Link></EmptyState></Card>
      ) : (
        <div className="space-y-3">
          {orders.map((o) => (
            <Card key={o.id} className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link href={`${base}/orders/${o.id}?t=${orderToken(o.id)}`} className="font-semibold hover:underline">{o.number}</Link>
                <Badge tone={ORDER_STATUS_TONE[o.status]}>{ORDER_STATUS_LABEL[o.status as OrderStatus]}</Badge>
              </div>
              <p className="text-sm text-slate-500">{formatUaeDateTime(o.createdAt)} · {formatAED(o.total)} · {o.fulfillment === "pickup" ? "Pickup" : "Delivery"}</p>
              <ul className="mt-2 space-y-1 text-sm">
                {items.filter((i) => i.orderId === o.id).map((i) => {
                  const href = reorderHref(i);
                  return (
                    <li key={i.id} className="flex items-center justify-between gap-2">
                      <span className="text-slate-700">{i.productName} × {i.quantity}</span>
                      {href && <Link href={href} className="text-store text-xs font-semibold">Reorder</Link>}
                    </li>
                  );
                })}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
