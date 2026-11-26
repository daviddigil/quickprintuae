import { requireStorefrontTenant } from "@/lib/tenant";
import { storefrontUrl } from "@/lib/seo/storefront";
import { enabledProviders } from "@/server/payments";
import { getWalkInProduct, walkInGate } from "@/server/walk-in/customers";
import { walkInSettings } from "@/server/walk-in/settings";
import { WalkInFlow } from "@/components/store/walk-in/WalkInFlow";
import { WalkInUnavailable } from "@/components/store/walk-in/Unavailable";
import { orderingState } from "@/server/trust/gating";

export async function generateMetadata({ params }: { params: Promise<{ tenant: string }> }) {
  const t = await requireStorefrontTenant((await params).tenant);
  // transactional QR page: not a search landing page, so noindex (and NOT listed in the shop sitemap)
  return { title: "Print now (walk-in)", robots: { index: false, follow: false }, alternates: { canonical: storefrontUrl(t, "/walk-in") } };
}
export const dynamic = "force-dynamic";

export default async function WalkInPage({ params }: { params: Promise<{ tenant: string }> }) {
  const tenant = await requireStorefrontTenant((await params).tenant);
  const base = `/s/${tenant.slug}`;
  const gate = await walkInGate(tenant);
  const product = gate.ok ? await getWalkInProduct(tenant) : null;
  if (!gate.ok || !product || !(await orderingState(tenant)).open) return <WalkInUnavailable shopName={tenant.name} base={base} />;
  const s = walkInSettings(tenant);
  return (
    <WalkInFlow
      store={tenant.slug} shopName={tenant.name} config={product.config} maxFiles={s.maxFilesPerVisit}
      vatRate={tenant.settings?.vatRate ?? 5} pricesIncludeVat={!!tenant.settings?.pricesIncludeVat} providers={await enabledProviders(tenant)}
    />
  );
}
