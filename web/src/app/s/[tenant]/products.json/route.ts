import { resolveTenant } from "@/lib/tenant";
import { absoluteAsset, deliveryCfg, isIndexableTenant, shopCatalog, storefrontUrl } from "@/lib/seo/storefront";
import { categoryOf } from "@/lib/storefront-catalog";

export const dynamic = "force-dynamic";

/** Public machine-readable catalogue: products, option choices and quantity price tiers. No private data. */
export async function GET(_req: Request, ctx: { params: Promise<{ tenant: string }> }) {
  const t = await resolveTenant((await ctx.params).tenant);
  if (!t || !isIndexableTenant(t)) return new Response(JSON.stringify({ error: "not_found" }), { status: 404, headers: { "content-type": "application/json" } });
  const catalog = await shopCatalog(t);
  const body = {
    shop: { name: t.name, url: storefrontUrl(t), emirate: t.emirate, country: "AE", currency: "AED", vatRatePercent: t.settings?.vatRate ?? 5, pricesIncludeVat: !!t.settings?.pricesIncludeVat, hours: { open: deliveryCfg(t).openHour, close: deliveryCfg(t).closeHour, closedWeekdays: deliveryCfg(t).closedWeekdays } },
    products: catalog.map(({ product: p, from }) => ({
      slug: p.slug, name: p.name, kind: p.kind, category: categoryOf(p), images: [...new Set([p.imageUrl, ...(p.images ?? [])].filter((x): x is string => !!x))].map((u) => absoluteAsset(t, u)), description: p.description, url: storefrontUrl(t, `/p/${p.slug}`), fromPrice: from, currency: "AED", turnaroundHours: p.turnaroundHours,
      perPage: !!p.config.perPage, minQuantity: p.config.minQuantity ?? null, quantityPresets: p.config.quantityPresets ?? null,
      priceTiers: p.config.tiers.map((x) => ({ fromQuantity: x.min, unitPrice: x.unitPrice })),
      options: p.config.optionGroups.map((g) => ({ key: g.key, label: g.label, choices: g.choices.map((c) => ({ value: c.value, label: c.label })) })),
    })),
  };
  return new Response(JSON.stringify(body, null, 2), { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, s-maxage=1800, stale-while-revalidate=86400" } });
}
