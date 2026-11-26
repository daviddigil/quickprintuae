import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireStorefrontTenant } from "@/lib/tenant";
import { Configurator, type ConfiguratorInitial } from "@/components/store/configurator";
import { JsonLd } from "@/components/seo/JsonLd";
import { productLd, breadcrumbLd } from "@/lib/seo/jsonld";
import { absoluteAsset, aed, isIndexableTenant, productNoun, shopLd, storefrontUrl, trim } from "@/lib/seo/storefront";
import { startingPrice } from "@/components/store/price";
import { storefrontColumns } from "@/server/storefront-products";

type P = { params: Promise<{ tenant: string; slug: string }>; searchParams: Promise<{ cfg?: string }> };

async function load(p: P["params"]) {
  const { tenant: t, slug } = await p;
  const tenant = await requireStorefrontTenant(t);
  // explicit columns: `internal` (cost price, notes) is owner-only and must never be selected for the storefront
  const [product] = await db.select(storefrontColumns).from(schema.products)
    .where(and(eq(schema.products.tenantId, tenant.id), eq(schema.products.slug, slug), eq(schema.products.active, true))).limit(1);
  if (!product) notFound();
  return { tenant, product };
}

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { tenant, product } = await load(params);
  const noun = productNoun(product), from = startingPrice(product);
  const title = `${noun} in ${tenant.emirate}`;
  const description = trim(`${noun} in ${tenant.emirate}${from != null ? ` from ${aed(from)}` : ""}. ${product.description}`, 158);
  const url = storefrontUrl(tenant, `/p/${product.slug}`);
  const image = absoluteAsset(tenant, galleryOf(product)[0]) ?? storefrontUrl(tenant, "/og.png");
  return {
    title, description, alternates: { canonical: url },
    robots: isIndexableTenant(tenant) ? undefined : { index: false, follow: false },
    openGraph: { type: "website", url, title: `${title} | ${tenant.name}`, description, images: [{ url: image }] },
    twitter: { card: "summary_large_image", title: `${title} | ${tenant.name}`, description, images: [image] },
  };
}

/** Photos with the cover first, de-duplicated. */
const galleryOf = (p: { imageUrl: string | null; images: string[] | null }) => [...new Set([p.imageUrl, ...(p.images ?? [])].filter((x): x is string => !!x))];

function parseCfg(cfg?: string): ConfiguratorInitial | undefined {
  if (!cfg) return undefined;
  try {
    const v = JSON.parse(Buffer.from(cfg, "base64url").toString("utf8"));
    const selections = v && typeof v.selections === "object" ? Object.fromEntries(Object.entries(v.selections).filter(([, x]) => typeof x === "string")) as Record<string, string> : undefined;
    return { selections, quantity: Number.isInteger(v.quantity) ? v.quantity : undefined, pages: Number.isInteger(v.pages) ? v.pages : undefined };
  } catch { return undefined; }
}

export default async function ProductPage({ params, searchParams }: P) {
  const { tenant, product } = await load(params);
  const { cfg } = await searchParams;
  const url = storefrontUrl(tenant, `/p/${product.slug}`);
  const shop = await shopLd(tenant);
  const gallery = galleryOf(product);
  const ld = [
    shop,
    productLd({ url, name: product.name, description: product.description, category: product.category || productNoun(product), image: gallery.length ? gallery.map((u) => absoluteAsset(tenant, u)!) : absoluteAsset(tenant, tenant.logoUrl), shopId: String((shop as { "@id": string })["@id"]), shopName: tenant.name, lowPrice: startingPrice(product), vatIncluded: !!tenant.settings?.pricesIncludeVat }),
    breadcrumbLd([{ name: tenant.name, url: storefrontUrl(tenant) }, { name: product.name, url }]),
  ];
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <JsonLd data={ld} />
      <nav className="mb-4 text-sm text-on-surface-variant"><a href={`/s/${tenant.slug}`} className="hover:text-on-surface">Home</a>{product.category ? <> / <a href={`/s/${tenant.slug}?category=${encodeURIComponent(product.category)}#products`} className="hover:text-on-surface">{product.category}</a></> : null} / {product.name}</nav>
      <h1 className="text-3xl font-extrabold tracking-tight">{product.name}</h1>
      <p className="mt-2 max-w-2xl text-on-surface-variant">{product.description}</p>
      <div className="mt-8">
        <Configurator
          store={tenant.slug}
          product={{ id: product.id, slug: product.slug, name: product.name, kind: product.kind, description: product.description, turnaroundHours: product.turnaroundHours, config: product.config, images: gallery }}
          aiEnabled={tenant.settings?.aiDesignerEnabled !== false}
          vatRate={tenant.settings?.vatRate ?? 5}
          pricesIncludeVat={!!tenant.settings?.pricesIncludeVat}
          initial={parseCfg(cfg)}
        />
      </div>
    </div>
  );
}
