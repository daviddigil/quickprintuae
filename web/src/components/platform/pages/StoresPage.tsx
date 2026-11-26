import Link from "next/link";
import { MapPin, Clock, Phone, MessageCircle, ArrowUpRight } from "lucide-react";
import { MarketingFooter, MarketingNav } from "@/components/platform/MarketingNav";
import { JsonLd } from "@/components/seo/JsonLd";
import { fill, getCopy, hrefFor, type Locale } from "@/lib/i18n";
import { EMIRATES } from "@/lib/types";
import { areasWithShops, countBy, filterShops, type DirectoryShop } from "@/lib/directory";
import { getDirectoryShops } from "@/server/directory";
import { localizedPath } from "@/lib/seo/metadata";
import { abs } from "@/lib/seo/site";

export interface StoresSearch { emirate?: string; area?: string; q?: string }

const initial = (name: string) => (name.trim()[0] ?? "Q").toUpperCase();

function ShopCard({ s, t }: { s: DirectoryShop; t: ReturnType<typeof getCopy>["storesPage"] }) {
  return (
    <li className="flex flex-col rounded-shape-xl border border-outline-variant bg-surface-lowest p-5" data-testid="shop-card">
      <div className="flex items-center gap-3">
        {s.logoUrl
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={s.logoUrl} alt="" className="size-11 rounded-xl border border-outline-variant object-contain" />
          : <span aria-hidden className="grid size-11 place-items-center rounded-xl text-lg font-bold text-white" style={{ background: s.color }}>{initial(s.name)}</span>}
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-on-surface">{s.name}</h3>
          <p className="text-sm text-on-surface-variant">{[s.area, t.emirates[s.emirate] ?? s.emirate].filter(Boolean).join(" · ")}</p>
        </div>
      </div>
      <dl className="mt-4 space-y-1.5 text-sm text-on-surface-variant">
        {s.address && <div className="flex gap-2"><MapPin aria-hidden className="mt-0.5 size-4 shrink-0" /><dd>{s.address}</dd></div>}
        {s.hours && <div className="flex gap-2"><Clock aria-hidden className="mt-0.5 size-4 shrink-0" /><dd><span className="sr-only">{t.hours}: </span>{s.hours}</dd></div>}
      </dl>
      <div className="mt-5 flex flex-wrap items-center gap-2 pt-1">
        <a href={s.url} className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-on-primary">{t.openStore}<ArrowUpRight aria-hidden className="size-4 rtl:-scale-x-100" /></a>
        {s.whatsapp && <a href={`https://wa.me/${s.whatsapp}`} className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-outline-variant px-4 text-sm font-medium text-on-surface"><MessageCircle aria-hidden className="size-4" />{t.whatsapp}</a>}
        {s.phone && <a href={`tel:${s.phone}`} className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-outline-variant px-4 text-sm font-medium text-on-surface"><Phone aria-hidden className="size-4" />{t.call}</a>}
      </div>
    </li>
  );
}

/** Live stores directory, shared by "/stores" (en) and "/ar/stores" (ar). Filters are plain URL query params (works without JS). */
export async function StoresPage({ locale, search }: { locale: Locale; search: StoresSearch }) {
  const copy = getCopy(locale), t = copy.storesPage;
  const all = await getDirectoryShops();
  const emirate = EMIRATES.includes(search.emirate as never) ? search.emirate : undefined;
  const areaOptions = areasWithShops(all, emirate);
  const area = search.area && areaOptions.includes(search.area) ? search.area : undefined;
  const q = (search.q ?? "").slice(0, 60);
  const shops = filterShops(all, { emirate, area, q });
  const perEmirate = countBy(all, (s) => s.emirate);
  const base = hrefFor(locale, "/stores");
  const chip = (label: string, value: string | undefined, n: number) => {
    const active = (emirate ?? "") === (value ?? "");
    const href = value ? `${base}?emirate=${encodeURIComponent(value)}` : base;
    return <Link key={value ?? "all"} href={href} aria-current={active ? "true" : undefined} className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-sm font-medium ${active ? "border-primary bg-primary-container text-on-primary-container" : "border-outline-variant text-on-surface"}`}>{label}<span className="text-xs text-on-surface-variant tabular-nums">{n}</span></Link>;
  };
  const itemList = {
    "@context": "https://schema.org", "@type": "CollectionPage", name: t.meta.title, url: abs(localizedPath("/stores", locale)),
    mainEntity: { "@type": "ItemList", itemListElement: shops.slice(0, 50).map((s, i) => ({ "@type": "ListItem", position: i + 1, url: s.url, name: s.name })) },
  };
  return (
    <div className="theme-auto min-h-screen">
      <JsonLd data={itemList} />
      <MarketingNav locale={locale} />
      <main id="main">
        <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 md:py-20">
          <p className="proof-label">{t.label}</p>
          <h1 className="mt-5 max-w-3xl font-display text-display font-bold">{t.h1}</h1>
          <p className="measure mt-5 text-lg text-on-surface-variant">{t.lead}</p>

          <nav aria-label={t.emirateLabel} className="mt-8 flex flex-wrap gap-2">
            {chip(t.allEmirates, undefined, all.length)}
            {EMIRATES.filter((e) => perEmirate[e]).map((e) => chip(t.emirates[e] ?? e, e, perEmirate[e]))}
          </nav>

          <form method="get" action={base} className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end" role="search">
            {emirate && <input type="hidden" name="emirate" value={emirate} />}
            <label className="text-sm font-medium text-on-surface">{t.areaLabel}
              <select name="area" defaultValue={area ?? ""} className="mt-1 block min-h-11 w-full rounded-shape-md border border-outline-variant bg-surface-lowest px-3 text-sm">
                <option value="">{t.allAreas}</option>
                {areaOptions.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium text-on-surface">{t.searchLabel}
              <input name="q" type="search" defaultValue={q} placeholder={t.searchPlaceholder} className="mt-1 block min-h-11 w-full rounded-shape-md border border-outline-variant bg-surface-lowest px-3 text-sm" />
            </label>
            <div className="flex gap-2">
              <button className="min-h-11 rounded-full bg-primary px-5 text-sm font-semibold text-on-primary">{t.apply}</button>
              {(emirate || area || q) && <Link href={base} className="inline-flex min-h-11 items-center rounded-full border border-outline-variant px-4 text-sm font-medium text-on-surface">{t.clear}</Link>}
            </div>
          </form>

          <p className="mt-8 text-sm text-on-surface-variant" aria-live="polite" data-testid="stores-count">{fill(shops.length === 1 ? t.countOne : t.countMany, { n: shops.length })}</p>
          {shops.length ? (
            <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="stores-list">{shops.map((s) => <ShopCard key={s.slug} s={s} t={t} />)}</ul>
          ) : (
            <div className="mt-4 rounded-shape-xl border border-dashed border-outline-variant p-10 text-center" data-testid="stores-empty">
              <p className="text-lg font-semibold text-on-surface">{t.emptyH}</p>
              <p className="mx-auto mt-2 max-w-md text-on-surface-variant">{t.emptyLead}</p>
            </div>
          )}

          <aside className="mt-12 flex flex-col items-start justify-between gap-4 rounded-shape-xl bg-surface-container p-6 sm:flex-row sm:items-center">
            <div><h2 className="text-lg font-semibold text-on-surface">{t.ownerH}</h2><p className="mt-1 max-w-xl text-on-surface-variant">{t.ownerLead}</p></div>
            <Link href={hrefFor(locale, "/signup")} className="inline-flex min-h-11 items-center rounded-full bg-primary px-5 text-sm font-semibold text-on-primary">{t.ownerCta}</Link>
          </aside>
        </section>
      </main>
      <MarketingFooter locale={locale} />
    </div>
  );
}
