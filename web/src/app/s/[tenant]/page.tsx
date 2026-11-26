import Link from "next/link";
import { and, asc, eq, gt, isNull, lte, or } from "drizzle-orm";
import { ArrowRight, Clock, CreditCard, Lock, MapPin, Truck, Upload } from "lucide-react";
import { db, schema } from "@/db";
import { requireStorefrontTenant } from "@/lib/tenant";
import { formatAED } from "@/lib/pricing";
import { startingPrice } from "@/components/store/price";
import { enabledProviders } from "@/server/payments";
import { ProductIcon } from "@/components/store/product-icon";
import { HeroSlider } from "@/components/store/HeroSlider";
import type { StorefrontProduct } from "@/server/storefront-products";
import { storefrontColumns } from "@/server/storefront-products";
import { groupByCategory, resolveCategory } from "@/lib/storefront-catalog";
import { cn } from "@/components/ui";
import type { Metadata } from "next";
import { JsonLd } from "@/components/seo/JsonLd";
import { isIndexableTenant, shopLd, storefrontUrl, trim } from "@/lib/seo/storefront";

export async function generateMetadata({ params }: { params: Promise<{ tenant: string }> }): Promise<Metadata> {
  const t = await requireStorefrontTenant((await params).tenant);
  const description = trim(t.settings?.heroSubtitle || `Order printing online from ${t.name} in ${t.emirate}: documents, photos, business cards and more. Pickup or delivery.`, 158);
  return { title: { absolute: `${t.name} — online printing in ${t.emirate}` }, description, alternates: { canonical: storefrontUrl(t) }, robots: isIndexableTenant(t) ? undefined : { index: false, follow: false } };
}

export default async function StoreHome({ params, searchParams }: { params: Promise<{ tenant: string }>; searchParams: Promise<{ category?: string | string[] }> }) {
  const tenant = await requireStorefrontTenant((await params).tenant);
  const sp = await searchParams;
  // explicit columns: `internal` (cost price) must never reach the storefront
  const products = await db.select(storefrontColumns).from(schema.products)
    .where(and(eq(schema.products.tenantId, tenant.id), eq(schema.products.active, true))).orderBy(asc(schema.products.sortOrder));
  const now = new Date();
  // only slides inside their offer window (start/end dates are optional)
  const banners = await db.select().from(schema.banners)
    .where(and(eq(schema.banners.tenantId, tenant.id), eq(schema.banners.active, true),
      or(isNull(schema.banners.startsAt), lte(schema.banners.startsAt, now)), or(isNull(schema.banners.endsAt), gt(schema.banners.endsAt, now))))
    .orderBy(asc(schema.banners.sortOrder), asc(schema.banners.createdAt));
  const featured = products.filter((p) => p.featured);
  const others = products.filter((p) => !p.featured);
  const groups = groupByCategory(products);
  const multi = groups.length > 1;
  const selected = resolveCategory(groups, sp.category);
  const shown = selected ? groups.filter((g) => g.name === selected) : groups;
  const base = `/s/${tenant.slug}`;
  const providers = await enabledProviders(tenant);
  const s = tenant.settings;

  const ld = await shopLd(tenant);
  return (
    <>
      <JsonLd data={ld} />
      {banners.length > 0 && <h1 className="sr-only">{s?.heroTitle || `${tenant.name} — online printing in ${tenant.emirate}`}</h1>}
      <HeroSlider shopName={tenant.name} slides={banners.map((b) => ({ id: b.id, version: b.version, title: b.title, subtitle: b.subtitle, linkUrl: b.linkUrl, ctaLabel: b.ctaLabel, source: b.source }))} />
      {banners.length > 0 && (
        <div className="mx-auto flex max-w-6xl flex-wrap gap-3 px-4 pt-4">
          {products[0] && <Link href={`${base}/p/${products[0].slug}`} className="btn-store inline-flex items-center gap-2 rounded-lg px-5 py-2.5 font-semibold">Start printing <ArrowRight className="h-4 w-4" /></Link>}
          {products.find((p) => p.kind === "business_card") && <Link href={`${base}/p/${products.find((p) => p.kind === "business_card")!.slug}`} className="inline-flex items-center gap-2 rounded-lg border border-outline-variant bg-white px-5 py-2.5 font-semibold">Design a business card with AI</Link>}
        </div>
      )}
      {banners.length === 0 && (
      <section className="bg-store-soft">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:py-20">
          <h1 className="max-w-2xl text-3xl font-extrabold tracking-tight text-on-surface sm:text-5xl">{s?.heroTitle || "Print anything, fast."}</h1>
          <p className="mt-4 max-w-xl text-lg text-on-surface-variant">{s?.heroSubtitle || "Upload, pay online and pick up or get it delivered."}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            {products[0] && <Link href={`${base}/p/${products[0].slug}`} className="btn-store inline-flex items-center gap-2 rounded-lg px-5 py-3 font-semibold">Start printing <ArrowRight className="h-4 w-4" /></Link>}
            {products.find((p) => p.kind === "business_card") && (
              <Link href={`${base}/p/${products.find((p) => p.kind === "business_card")!.slug}`} className="inline-flex items-center gap-2 rounded-lg border border-outline-variant bg-white px-5 py-3 font-semibold hover:bg-surface-low">Design a business card with AI</Link>
            )}
          </div>
        </div>
      </section>
      )}

      <section id="products" className="mx-auto max-w-6xl scroll-mt-28 px-4 py-12">
        {multi ? (
          <>
            <nav aria-label="Product categories" className="-mx-1 flex flex-wrap gap-2" data-testid="category-chips">
              {[{ name: "All", href: base }, ...groups.map((g) => ({ name: g.name, href: `${base}?category=${encodeURIComponent(g.name)}` }))].map((c) => {
                const on = c.name === "All" ? !selected : c.name === selected;
                return (
                  <Link key={c.name} href={`${c.href}#products`} scroll={false} aria-current={on ? "true" : undefined} data-category={c.name}
                    className={cn("inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium", on ? "btn-store border-transparent" : "border-outline-variant bg-white text-on-surface hover:bg-surface-low")}>
                    {c.name}
                  </Link>
                );
              })}
            </nav>
            {shown.map((g) => (
              <div key={g.name} className="mt-8" data-testid={`category-${g.name}`}>
                <h2 className="text-2xl font-bold">{g.name}</h2>
                <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {g.products.map((p) => <li key={p.id} className="flex"><ProductCard p={p} base={base} /></li>)}
                </ul>
              </div>
            ))}
          </>
        ) : (
          <>
            <h2 className="text-2xl font-bold">{groups[0]?.name === "Print" || !groups[0] ? "Popular products" : groups[0].name}</h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {(featured.length ? featured : others).map((p) => <ProductCard key={p.id} p={p} base={base} />)}
            </div>
            {featured.length > 0 && others.length > 0 && (
              <>
                <h2 className="mt-12 text-xl font-bold">More printing</h2>
                <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {others.map((p) => <ProductCard key={p.id} p={p} base={base} compact />)}
                </div>
              </>
            )}
          </>
        )}
      </section>

      <section className="border-y border-outline-variant bg-surface-low">
        <div className="mx-auto max-w-6xl px-4 py-12">
          <h2 className="text-2xl font-bold">How it works</h2>
          <div className="mt-6 grid gap-6 sm:grid-cols-3">
            {[
              { i: Upload, t: "1. Upload or design", d: "Upload your PDF, Word file or photos — or design a business card with AI." },
              { i: CreditCard, t: "2. Pay securely online", d: "Pay by card, Apple Pay or Google Pay. Instant confirmation." },
              { i: Truck, t: "3. Pick up or get it delivered", d: "Collect at our branch or choose a scheduled delivery slot anywhere in the UAE." },
            ].map(({ i: I, t, d }) => (
              <div key={t} className="rounded-xl bg-white p-5 shadow-sm">
                <I className="text-store h-7 w-7" /><p className="mt-3 font-semibold">{t}</p><p className="mt-1 text-sm text-on-surface-variant">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-4 py-12 sm:grid-cols-4">
        {[
          { i: CreditCard, t: "Online payment only", d: providers.length ? "Secured by Stripe. No cash on delivery." : "Secure card payments. No cash on delivery." },
          { i: Lock, t: "Confidential handling", d: "Encrypted uploads, sealed envelopes, files auto-deleted after collection." },
          { i: Clock, t: "Same-day options", d: "Documents and passport photos ready in as little as 1–2 hours." },
          { i: MapPin, t: "UAE-wide delivery", d: "All seven emirates with scheduled time slots." },
        ].map(({ i: I, t, d }) => (
          <div key={t} className="flex gap-3"><I className="text-store mt-0.5 h-5 w-5 shrink-0" /><div><p className="font-semibold">{t}</p><p className="text-sm text-on-surface-variant">{d}</p></div></div>
        ))}
      </section>
    </>
  );
}

function ProductCard({ p, base, compact }: { p: StorefrontProduct; base: string; compact?: boolean }) {
  const from = startingPrice(p);
  const photo = p.imageUrl || p.images?.[0] || null;
  return (
    <Link href={`${base}/p/${p.slug}`} className="group flex w-full flex-col overflow-hidden rounded-xl border border-outline-variant bg-white transition hover:-translate-y-0.5 hover:shadow-md">
      <div className={`bg-store-soft flex items-center justify-center ${compact ? "aspect-[16/9]" : "aspect-[4/3]"}`}>
        {photo
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={photo} alt="" loading="lazy" className="h-full w-full object-cover" />
          : <ProductIcon kind={p.kind} className="text-store h-12 w-12 transition group-hover:scale-110" />}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <p className="font-semibold">{p.name}</p>
        {!compact && <p className="mt-1 line-clamp-2 text-sm text-on-surface-variant">{p.description}</p>}
        <div className="mt-auto flex items-center justify-between pt-3 text-sm">
          {from != null && <span className="text-on-surface-variant">from <span className="font-semibold text-on-surface">{formatAED(from)}</span></span>}
          <span className="text-store font-semibold">Order →</span>
        </div>
      </div>
    </Link>
  );
}
