import Link from "next/link";
import { MarketingFooter, MarketingNav } from "@/components/platform/MarketingNav";
import { hrefFor, type Locale } from "@/lib/i18n";
import { formatLegalDate, getLegalCopy } from "@/lib/i18n/legal";
import { LEGAL_KEYS, LEGAL_PATHS, LEGAL_UPDATED, LEGAL_VERSION, type LegalKey } from "@/lib/legal";
import { primeTrialDays } from "@/server/platform-settings";

/** Shared by /terms, /privacy, /refunds, /seller-agreement and their /ar twins. Plain, readable long-form page with the lawyer-review notice on top. */
export async function LegalPage({ locale, doc }: { locale: Locale; doc: LegalKey }) {
  const trialDays = await primeTrialDays();
  const L = getLegalCopy(locale, trialDays), d = L.docs[doc];
  return (
    <div className="theme-auto min-h-screen">
      <MarketingNav locale={locale} />
      <main id="main">
        <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6 md:py-16" data-testid="legal-page" data-doc={doc}>
          <div role="note" data-testid="legal-notice" className="mb-8 rounded-shape-md border border-warning bg-warning-container px-4 py-3 text-sm font-semibold text-on-warning-container">{L.notice}</div>
          <h1 className="font-display text-display font-bold">{d.h1}</h1>
          <p className="mt-3 text-sm text-on-surface-variant" data-testid="legal-version">
            {L.version}: <span dir="ltr" className="tabular-nums">{LEGAL_VERSION}</span> · {L.updated}: <time dateTime={LEGAL_UPDATED} className="tabular-nums">{formatLegalDate(LEGAL_UPDATED, locale)}</time>
          </p>
          <p className="measure mt-5 text-lg text-on-surface-variant">{d.lead}</p>

          <nav aria-label={L.toc} className="mt-8 rounded-shape-lg border border-outline-variant bg-surface-low p-4">
            <p className="text-sm font-semibold">{L.toc}</p>
            <ol className="mt-2 columns-1 gap-6 text-sm sm:columns-2">
              {d.sections.map((s, i) => <li key={i} className="break-inside-avoid"><a href={`#s${i + 1}`} className="inline-flex min-h-8 items-center text-on-surface-variant underline-offset-2 hover:text-on-surface hover:underline">{s.h}</a></li>)}
            </ol>
          </nav>

          <div className="mt-10 space-y-10">
            {d.sections.map((s, i) => (
              <section key={i} id={`s${i + 1}`} className="scroll-mt-24">
                <h2 className="font-display text-headline font-bold">{s.h}</h2>
                {s.p?.map((t, j) => <p key={j} className="measure mt-3 text-on-surface-variant">{t}</p>)}
                {s.ul && <ul className="measure mt-3 list-disc space-y-2 ps-6 text-on-surface-variant marker:text-outline">{s.ul.map((t, j) => <li key={j}>{t}</li>)}</ul>}
                {s.after?.map((t, j) => <p key={j} className="measure mt-3 text-on-surface-variant">{t}</p>)}
              </section>
            ))}
          </div>

          <nav aria-label={L.otherDocs} className="mt-14 border-t border-outline-variant pt-6">
            <p className="text-sm font-semibold">{L.otherDocs}</p>
            <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
              {LEGAL_KEYS.filter((k) => k !== doc).map((k) => <li key={k}><Link href={hrefFor(locale, LEGAL_PATHS[k])} className="inline-flex min-h-9 items-center underline underline-offset-2">{L.nav[k]}</Link></li>)}
            </ul>
          </nav>
        </article>
      </main>
      <MarketingFooter locale={locale} />
    </div>
  );
}
