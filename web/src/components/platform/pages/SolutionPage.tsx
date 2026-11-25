import Link from "next/link";
import { MarketingFooter, MarketingNav } from "@/components/platform/MarketingNav";
import { FaqSection } from "@/components/platform/home/FaqSection";
import { FinalCta } from "@/components/platform/home/FinalCta";
import { ChatPanel, QueuePanel, StorefrontPanel } from "@/components/platform/home/Showcase";
import { Icon } from "@/components/platform/home/icons";
import { JsonLd } from "@/components/seo/JsonLd";
import { abs } from "@/lib/seo/site";
import { breadcrumbLd, faqLd } from "@/lib/seo/jsonld";
import { localizedPath } from "@/lib/seo/metadata";
import { getCopy, hrefFor, type Locale, type SolutionSlug } from "@/lib/i18n";

const labelOf = (c: ReturnType<typeof getCopy>, slug: string) => (slug === "print-shops" ? c.nav.printShops : slug === "walk-in-queue" ? c.nav.walkIn : c.nav.whatsapp);

/** Solution landing page, shared by "/solutions/<slug>" (en) and "/ar/solutions/<slug>" (ar). */
export function SolutionPage({ locale, slug }: { locale: Locale; slug: SolutionSlug }) {
  const copy = getCopy(locale), s = copy.solutions, page = s.pages[slug], h = (p: string) => hrefFor(locale, p);
  const faq = [...page.faq.map((i) => copy.home.faq[i]), ...page.extraFaq];
  const panel = page.panel === "store" ? <StorefrontPanel copy={copy} /> : page.panel === "queue" ? <QueuePanel copy={copy} /> : <ChatPanel copy={copy} />;
  const path = `/solutions/${slug}`;
  return (
    <div className="theme-auto min-h-screen">
      <JsonLd data={[
        faqLd(faq),
        breadcrumbLd([{ name: s.home, url: abs(localizedPath("/", locale)) }, { name: s.solutions, url: abs(localizedPath("/", locale)) + "#solutions" }, { name: page.h1, url: abs(localizedPath(path, locale)) }]),
      ]} />
      <MarketingNav locale={locale} />
      <main id="main">
        <section className="relative overflow-hidden border-b border-outline-variant/60">
          <div aria-hidden className="halftone halftone-fade-x pointer-events-none absolute inset-y-0 end-0 w-2/3 opacity-60" />
          <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 sm:px-6 md:py-20 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
            <div>
              <p className="proof-label">{page.label}</p>
              <h1 className="mt-5 font-display text-display font-bold text-on-surface">{page.h1}</h1>
              <p className="measure mt-6 text-lg text-on-surface-variant">{page.lead}</p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link href={h("/signup")} className="state-layer inline-flex min-h-12 items-center gap-2 rounded-full bg-primary px-7 text-base font-semibold text-on-primary shadow-elev-2">{s.ctaStart} <Icon name="arrow" className="size-5 rtl:-scale-x-100" /></Link>
                <Link href={h("/pricing")} className="state-layer inline-flex min-h-12 items-center rounded-full border border-outline px-6 text-base font-semibold text-on-surface">{s.ctaPricing}</Link>
              </div>
              <p className="mt-4 text-sm text-on-surface-variant">{copy.common.freeNote}</p>
            </div>
            <div className="min-w-0">{panel}</div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-24" aria-labelledby="benefits">
          <h2 id="benefits" className="font-display text-headline font-bold">{s.whatYouGet}</h2>
          <ul className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {page.benefits.map((b) => (
              <li key={b.title} className="rounded-shape-xl border border-outline-variant bg-surface-lowest p-6">
                <h3 className="font-display text-title font-semibold">{b.title}</h3>
                <p className="mt-2 text-sm text-on-surface-variant">{b.text}</p>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="steps" className="border-y border-outline-variant/60 bg-surface-low">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-24">
            <h2 id="steps" className="font-display text-headline font-bold">{s.howItWorks}</h2>
            <ol className="mt-10 grid gap-px overflow-hidden rounded-shape-xl border border-outline-variant bg-outline-variant md:grid-cols-3">
              {page.steps.map((st, i) => (
                <li key={st.title} className="bg-surface-lowest p-6 sm:p-8">
                  <p className="font-mono text-sm font-semibold text-primary">{s.step} {i + 1}</p>
                  <h3 className="mt-3 font-display text-title font-semibold">{st.title}</h3>
                  <p className="measure mt-2 text-on-surface-variant">{st.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <FaqSection items={faq} heading={s.faq} />

        <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6" aria-label={s.related}>
          <h2 className="text-sm font-semibold text-on-surface-variant">{s.related}</h2>
          <ul className="mt-3 flex flex-wrap gap-3">
            {page.related.map((r) => <li key={r}><Link href={h(`/solutions/${r}`)} className="state-layer inline-flex min-h-11 items-center rounded-full border border-outline px-5 text-sm font-semibold text-on-surface">{labelOf(copy, r)}</Link></li>)}
          </ul>
        </section>
        <FinalCta copy={copy} />
      </main>
      <MarketingFooter locale={locale} />
    </div>
  );
}
