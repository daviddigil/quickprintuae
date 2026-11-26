import { requireStorefrontTenant } from "@/lib/tenant";
import { CartView } from "@/components/store/cart-view";
import { NotOpenNotice } from "@/components/store/not-open";
import { orderingState } from "@/server/trust/gating";

export const metadata = { title: "Cart" };
export const dynamic = "force-dynamic";

export default async function CartPage({ params }: { params: Promise<{ tenant: string }> }) {
  const tenant = await requireStorefrontTenant((await params).tenant);
  const ordering = await orderingState(tenant);
  if (!ordering.open) return <NotOpenNotice slug={tenant.slug} title="Your cart" />;
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold">Your cart</h1>
      <CartView store={tenant.slug} vatRate={tenant.settings?.vatRate ?? 5} pricesIncludeVat={!!tenant.settings?.pricesIncludeVat} />
    </div>
  );
}
