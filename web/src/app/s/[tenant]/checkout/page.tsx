import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getCustomer } from "@/lib/auth";
import { requireStorefrontTenant } from "@/lib/tenant";
import { enabledProviders } from "@/server/payments";
import { deliverySettings } from "@/server/checkout";
import { CheckoutForm } from "@/components/store/checkout-form";
import { NotOpenNotice } from "@/components/store/not-open";
import { orderingState } from "@/server/trust/gating";
import { getSellerIdentity } from "@/server/seller-identity";
import { resolveReturnsPolicyBoth } from "@/lib/consumer-terms";

export const metadata = { title: "Checkout" };
export const dynamic = "force-dynamic";

export default async function CheckoutPage({ params }: { params: Promise<{ tenant: string }> }) {
  const tenant = await requireStorefrontTenant((await params).tenant);
  if (!(await orderingState(tenant)).open) return <NotOpenNotice slug={tenant.slug} title="Checkout" />;
  const [locations, zones, products, customer] = await Promise.all([
    db.select().from(schema.pickupLocations).where(and(eq(schema.pickupLocations.tenantId, tenant.id), eq(schema.pickupLocations.active, true))),
    db.select().from(schema.deliveryZones).where(and(eq(schema.deliveryZones.tenantId, tenant.id), eq(schema.deliveryZones.active, true))),
    db.select({ id: schema.products.id, t: schema.products.turnaroundHours }).from(schema.products).where(eq(schema.products.tenantId, tenant.id)),
    getCustomer(tenant.id),
  ]);
  const seller = await getSellerIdentity(tenant);
  const pol = resolveReturnsPolicyBoth(tenant.returnsPolicy);
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold">Checkout</h1>
      <CheckoutForm
        store={tenant.slug}
        vatRate={tenant.settings?.vatRate ?? 5}
        pricesIncludeVat={!!tenant.settings?.pricesIncludeVat}
        delivery={deliverySettings(tenant)}
        providers={await enabledProviders(tenant)}
        turnaround={Object.fromEntries(products.map((p) => [p.id, p.t]))}
        pickupLocations={locations.map((l) => ({ id: l.id, name: l.name, address: l.address, emirate: l.emirate, hours: l.hours }))}
        zones={zones.map((z) => ({ emirate: z.emirate, fee: z.fee, freeAbove: z.freeAbove, minLeadHours: z.minLeadHours }))}
        prefill={customer ? { name: customer.name, email: customer.email, phone: customer.phone ?? "" } : undefined}
        defaultEmirate={tenant.emirate}
        seller={seller}
        policy={{ en: pol.en.text, ar: pol.ar?.text ?? null, isTemplate: pol.en.isTemplate }}
      />
    </div>
  );
}
