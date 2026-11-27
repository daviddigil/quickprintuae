import Link from "next/link";
import { MarketingFooter, MarketingNav } from "@/components/platform/MarketingNav";
import type { Locale } from "@/lib/i18n";
import { AUP_VERSION, getAupCopy } from "@/lib/i18n/aup";

/** /acceptable-use and /ar/acceptable-use. Template text: see src/lib/i18n/aup.ts. */
export function AupPage({ locale }: { locale: Locale }) {
  const c = getAupCopy(locale);
  return (
    <div className="theme-auto min-h-screen">
      <MarketingNav locale={locale} />
      <main id="main">
        <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6 md:py-16" data-testid="legal-page" data-doc="acceptable-use">
          <div role="note" data-testid="legal-notice" className="mb-8 rounded-shape-md border border-warning bg-warning-container px-4 py-3 text-sm font-semibold text-on-warning-container">{c.notice}</div>
          <h1 className="font-display text-display font-bold">{c.h1}</h1>
          <p className="mt-3 text-sm text-on-surface-variant" data-testid="legal-version"><span dir="ltr" className="tabular-nums">{AUP_VERSION}</span></p>
          <p className="measure mt-5 text-lg text-on-surface-variant">{c.lead}</p>
          <div className="mt-10 space-y-10">
            {c.sections.map((s, i) => (
              <section key={i} id={`s${i + 1}`} className="scroll-mt-24">
                <h2 className="font-display text-headline font-bold">{s.h}</h2>
                {s.p?.map((t, j) => <p key={j} className="measure mt-3 text-on-surface-variant">{t}</p>)}
                {s.ul && <ul className="measure mt-3 list-disc space-y-2 ps-6 text-on-surface-variant marker:text-outline">{s.ul.map((t, j) => <li key={j}>{t}</li>)}</ul>}
              </section>
            ))}
          </div>
          <p className="mt-12"><Link href={c.reportHref} className="inline-flex min-h-11 items-center rounded-shape-md border border-outline px-4 text-sm font-semibold underline-offset-2 hover:underline">{c.reportCta}</Link></p>
        </article>
      </main>
      <MarketingFooter locale={locale} />
    </div>
  );
}
