import Link from "next/link";
import type { Offer } from "@/db/schema";
import { themeStyle } from "@/lib/offer-themes";
import { describeOfferL, offerCopy, offerHeadline } from "@/lib/i18n/offers";
import { Countdown } from "./Countdown";

type BannerOffer = Pick<Offer, "id" | "name" | "code" | "headline" | "theme" | "kind" | "value" | "durationMonths" | "endsAt">;

/**
 * Themed announcement bar for a live offer (home, pricing, signup; en + ar). Colours come from the theme preset
 * (AA-checked pairs), not the page theme, so the offer looks the same in light and dark mode.
 * Server component: pass the offer from loadBannerOffers(). Also used (static) by the superadmin preview.
 */
export function OfferBanner({ offer, locale = "en", href, preview }: { offer: BannerOffer; locale?: string; href?: string; preview?: boolean }) {
  const c = offerCopy(locale), s = themeStyle(offer.theme);
  const ends = new Date(offer.endsAt);
  const dateLabel = new Intl.DateTimeFormat(locale === "ar" ? "ar-AE-u-nu-latn" : "en-AE", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Dubai" }).format(ends);
  const target = href ?? `${locale === "ar" ? "/ar" : ""}/signup?offer=${encodeURIComponent(offer.code ?? offer.id)}`;
  return (
    <section aria-label={c.badge} data-testid="offer-banner" data-offer-id={offer.id} dir={locale === "ar" ? "rtl" : "ltr"} style={{ background: s.bg, color: s.fg }}>
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
        <span className="rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide" style={{ background: s.accent, color: s.onAccent }}>{c.badge}</span>
        <p className="min-w-0 flex-1 text-sm sm:text-base">
          <strong className="font-bold">{offerHeadline(offer, locale)}</strong>{" "}
          <span data-testid="offer-banner-text">{describeOfferL(offer, locale)}.</span>{" "}
          <span className="whitespace-nowrap opacity-90"><Countdown endsAt={ends.toISOString()} locale={locale} dateLabel={dateLabel} /></span>
          {offer.code && <> <span className="whitespace-nowrap">{c.code}: <code dir="ltr" className="rounded px-1.5 py-0.5 font-mono font-bold" style={{ background: s.accent, color: s.onAccent }}>{offer.code}</code></span></>}
        </p>
        {preview ? (
          <span className="inline-flex min-h-11 items-center rounded-full px-5 text-sm font-semibold" style={{ background: s.accent, color: s.onAccent }}>{c.cta}</span>
        ) : (
          <Link href={target} data-testid="offer-banner-cta" className="inline-flex min-h-11 items-center rounded-full px-5 text-sm font-semibold underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2" style={{ background: s.accent, color: s.onAccent, outlineColor: s.accent }}>{c.cta}</Link>
        )}
      </div>
    </section>
  );
}
