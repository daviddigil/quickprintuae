import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { ArrowRight, Clock, CreditCard, Lock, MapPin, Truck, Upload } from "lucide-react";
import { db, schema } from "@/db";
import { requireStorefrontTenant } from "@/lib/tenant";
import { formatAED } from "@/lib/pricing";
import { startingPrice } from "@/components/store/price";
import { enabledProviders } from "@/server/payments";
import { ProductIcon } from "@/components/store/product-icon";
import type { Product } from "@/db/schema";

export default async function StoreHome({ params }: { params: Promise<{ tenant: string }> }) {
  const tenant = await requireStorefrontTenant((await params).tenant);
  const products = await db.select().from(schema.products)
    .where(and(eq(schema.products.tenantId, tenant.id), eq(schema.products.active, true))).orderBy(asc(schema.products.sortOrder));
  const banners = await db.select().from(schema.banners)
    .where(and(eq(schema.banners.tenantId, tenant.id), eq(schema.banners.active, true))).orderBy(asc(schema.banners.sortOrder));
  const featured = products.filter((p) => p.featured);
  const others = products.filter((p) => !p.featured);
  const base = `/s/${tenant.slug}`;
  const providers = enabledProviders(tenant);
  const s = tenant.settings;

  return (
    <>
      {banners.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 pt-4" data-testid="store-banners">
          <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto rounded-xl">
            {banners.map((b) => {
              // eslint-disable-next-line @next/next/no-img-element
              const img = <img src={`/api/banners/${b.id}?v=${b.version}`} alt={b.title || `${tenant.name} promotion`} className="aspect-[3/1] w-full rounded-xl object-cover" />;
              return <div key={b.id} className="w-full shrink-0 snap-center">{b.linkUrl ? <Link href={b.linkUrl}>{img}</Link> : img}</div>;
            })}
          </div>
        </section>
      )}
      <section className="bg-store-soft">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:py-20">
          <h1 className="max-w-2xl text-3xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">{s?.heroTitle || "Print anything, fast."}</h1>
          <p className="mt-4 max-w-xl text-lg text-slate-600">{s?.heroSubtitle || "Upload, pay online and pick up or get it delivered."}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            {products[0] && <Link href={`${base}/p/${products[0].slug}`} className="btn-store inline-flex items-center gap-2 rounded-lg px-5 py-3 font-semibold">Start printing <ArrowRight className="h-4 w-4" /></Link>}
            {products.find((p) => p.kind === "business_card") && (
              <Link href={`${base}/p/${products.find((p) => p.kind === "business_card")!.slug}`} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-5 py-3 font-semibold hover:bg-slate-50">Design a business card with AI</Link>
            )}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12">
        <h2 className="text-2xl font-bold">Popular products</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {featured.map((p) => <ProductCard key={p.id} p={p} base={base} />)}
        </div>
        {others.length > 0 && (
          <>
            <h2 className="mt-12 text-xl font-bold">More printing</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {others.map((p) => <ProductCard key={p.id} p={p} base={base} compact />)}
            </div>
          </>
        )}
      </section>

      <section className="border-y border-slate-200 bg-slate-50">
        <div className="mx-auto max-w-6xl px-4 py-12">
          <h2 className="text-2xl font-bold">How it works</h2>
          <div className="mt-6 grid gap-6 sm:grid-cols-3">
            {[
              { i: Upload, t: "1. Upload or design", d: "Upload your PDF, Word file or photos — or design a business card with AI." },
              { i: CreditCard, t: "2. Pay securely online", d: "Pay by card, Apple Pay or Google Pay. Instant confirmation." },
              { i: Truck, t: "3. Pick up or get it delivered", d: "Collect at our branch or choose a scheduled delivery slot anywhere in the UAE." },
            ].map(({ i: I, t, d }) => (
              <div key={t} className="rounded-xl bg-white p-5 shadow-sm">
                <I className="text-store h-7 w-7" /><p className="mt-3 font-semibold">{t}</p><p className="mt-1 text-sm text-slate-600">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-4 py-12 sm:grid-cols-4">
        {[
          { i: CreditCard, t: "Online payment only", d: providers.length ? `Secured by ${providers.map((p) => (p === "stripe" ? "Stripe" : "Mamo Pay")).join(" & ")}. No cash on delivery.` : "Secure card payments. No cash on delivery." },
          { i: Lock, t: "Confidential handling", d: "Encrypted uploads, sealed envelopes, files auto-deleted after collection." },
          { i: Clock, t: "Same-day options", d: "Documents and passport photos ready in as little as 1–2 hours." },
          { i: MapPin, t: "UAE-wide delivery", d: "All seven emirates with scheduled time slots." },
        ].map(({ i: I, t, d }) => (
          <div key={t} className="flex gap-3"><I className="text-store mt-0.5 h-5 w-5 shrink-0" /><div><p className="font-semibold">{t}</p><p className="text-sm text-slate-600">{d}</p></div></div>
        ))}
      </section>
    </>
  );
}

function ProductCard({ p, base, compact }: { p: Product; base: string; compact?: boolean }) {
  const from = startingPrice(p);
  return (
    <Link href={`${base}/p/${p.slug}`} className="group flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white transition hover:-translate-y-0.5 hover:shadow-md">
      <div className={`bg-store-soft flex items-center justify-center ${compact ? "h-28" : "h-40"}`}>
        {p.imageUrl
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={p.imageUrl} alt="" className="h-full w-full object-cover" />
          : <ProductIcon kind={p.kind} className="text-store h-12 w-12 transition group-hover:scale-110" />}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <p className="font-semibold">{p.name}</p>
        {!compact && <p className="mt-1 line-clamp-2 text-sm text-slate-600">{p.description}</p>}
        <div className="mt-auto flex items-center justify-between pt-3 text-sm">
          {from != null && <span className="text-slate-500">from <span className="font-semibold text-slate-900">{formatAED(from)}</span></span>}
          <span className="text-store font-semibold">Order →</span>
        </div>
      </div>
    </Link>
  );
}
