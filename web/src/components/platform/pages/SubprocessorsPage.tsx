import { MarketingFooter, MarketingNav } from "@/components/platform/MarketingNav";
import type { Locale } from "@/lib/i18n";
import { SUBPROCESSORS } from "@/lib/i18n/subprocessors";
import { LEGAL_UPDATED, LEGAL_VERSION } from "@/lib/legal";
import { formatLegalDate, getLegalCopy } from "@/lib/i18n/legal";

/** /subprocessors and /ar/subprocessors. Template content, lawyer review notice on top. */
export function SubprocessorsPage({ locale }: { locale: Locale }) {
  const c = SUBPROCESSORS[locale], L = getLegalCopy(locale, 7);
  return (
    <div className="theme-auto min-h-screen">
      <MarketingNav locale={locale} />
      <main id="main">
        <article className="mx-auto max-w-5xl px-4 py-12 sm:px-6 md:py-16" data-testid="subprocessors-page">
          <div role="note" data-testid="legal-notice" className="mb-8 rounded-shape-md border border-warning bg-warning-container px-4 py-3 text-sm font-semibold text-on-warning-container">{c.notice}</div>
          <h1 className="font-display text-display font-bold">{c.h1}</h1>
          <p className="mt-3 text-sm text-on-surface-variant">{L.version}: <span dir="ltr" className="tabular-nums">{LEGAL_VERSION}</span> · {L.updated}: <time dateTime={LEGAL_UPDATED} className="tabular-nums">{formatLegalDate(LEGAL_UPDATED, locale)}</time></p>
          <p className="measure mt-5 text-lg text-on-surface-variant">{c.lead}</p>
          <div className="mt-8 overflow-x-auto rounded-shape-lg border border-outline-variant">
            <table className="w-full min-w-[40rem] text-start text-sm" data-testid="subprocessors-table">
              <thead className="bg-surface-low text-xs uppercase text-on-surface-variant">
                <tr>{[c.cols.name, c.cols.purpose, c.cols.data, c.cols.location].map((h) => <th key={h} scope="col" className="px-4 py-3 text-start">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {c.rows.map((r) => (
                  <tr key={r.name} className="align-top">
                    <th scope="row" className="px-4 py-3 text-start font-semibold">{r.name}</th>
                    <td className="px-4 py-3 text-on-surface-variant">{r.purpose}</td>
                    <td className="px-4 py-3 text-on-surface-variant">{r.data}</td>
                    <td className="px-4 py-3 text-on-surface-variant">{r.location}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {c.footnote.map((t, i) => <p key={i} className="measure mt-4 text-sm text-on-surface-variant">{t}</p>)}
        </article>
      </main>
      <MarketingFooter locale={locale} />
    </div>
  );
}
