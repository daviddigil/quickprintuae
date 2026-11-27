import Link from "next/link";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { getCustomer } from "@/lib/auth";
import { requireStorefrontTenant } from "@/lib/tenant";
import { formatAED } from "@/lib/pricing";
import { formatUaeDateTime } from "@/lib/slots";
import { ORDER_STATUS_LABEL, type OrderStatus } from "@/lib/types";
import { Alert, Badge, Button, Card, EmptyState, ORDER_STATUS_TONE } from "@/components/ui";
import { AccountAuth } from "@/components/store/account-auth";
import { orderToken } from "@/server/checkout";
import { requestErasure, updateMarketing } from "./actions";

export const metadata = { title: "My account" };
export const dynamic = "force-dynamic";

export default async function AccountPage({ params, searchParams }: { params: Promise<{ tenant: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const tenant = await requireStorefrontTenant((await params).tenant);
  const sp = await searchParams;
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
        <div><h1 className="text-2xl font-bold">Hi, {customer.name.split(" ")[0]}</h1><p className="text-sm text-on-surface-variant">{customer.email}{customer.phone ? ` · ${customer.phone}` : ""}</p></div>
        <a href={`/logout?next=${base}`} className="text-sm font-medium text-on-surface-variant hover:text-on-surface">Sign out</a>
      </div>
      {sp.error && <div className="mt-4" role="alert"><Alert tone="red">{sp.error}</Alert></div>}
      {sp.ok && <div className="mt-4" role="status"><Alert tone="green">{sp.ok}</Alert></div>}
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
              <p className="text-sm text-on-surface-variant">{formatUaeDateTime(o.createdAt)} · {formatAED(o.total)} · {o.fulfillment === "pickup" ? "Pickup" : "Delivery"}</p>
              <ul className="mt-2 space-y-1 text-sm">
                {items.filter((i) => i.orderId === o.id).map((i) => {
                  const href = reorderHref(i);
                  return (
                    <li key={i.id} className="flex items-center justify-between gap-2">
                      <span className="text-on-surface-variant">{i.productName} × {i.quantity}</span>
                      {href && <Link href={href} className="text-store text-xs font-semibold">Reorder</Link>}
                    </li>
                  );
                })}
              </ul>
            </Card>
          ))}
        </div>
      )}

      <section aria-labelledby="privacy-h" className="mt-10" data-testid="privacy-section">
        <h2 id="privacy-h" className="mb-3 text-lg font-semibold">Your privacy</h2>
        <Card className="space-y-5 p-4">
          <form action={updateMarketing} className="space-y-2">
            <input type="hidden" name="store" value={tenant.slug} />
            <label className="flex items-start gap-3 text-sm"><input type="checkbox" name="marketing" defaultChecked={customer.marketingOptIn} className="mt-0.5 size-5" /><span>Send me offers by email and WhatsApp. <span className="block text-on-surface-variant">Off by default. Order updates are always sent.</span></span></label>
            <Button size="sm" variant="secondary">Save preference</Button>
          </form>
          <div className="border-t border-outline-variant pt-4">
            <p className="text-sm font-medium">Download my data</p>
            <p className="text-sm text-on-surface-variant">A JSON file with your profile, orders, quote requests and uploaded file details from {tenant.name}.</p>
            <a href={`${base}/account/export`} className="text-store mt-2 inline-flex min-h-11 items-center text-sm font-semibold underline">Download my data (JSON)</a>
          </div>
          <form action={requestErasure} className="space-y-2 border-t border-outline-variant pt-4">
            <input type="hidden" name="store" value={tenant.slug} />
            <p className="text-sm font-medium">Delete my data</p>
            <p className="text-sm text-on-surface-variant">We will remove your personal details and uploaded files and close your account. Invoices and order totals must be kept by law, without your personal details. {tenant.name} will confirm within 30 days.</p>
            <Button size="sm" variant="danger">Request deletion of my data</Button>
          </form>
        </Card>
      </section>
    </div>
  );
}
