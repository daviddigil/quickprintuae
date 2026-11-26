import Link from "next/link";
import { MarketingFooter, MarketingNav } from "@/components/platform/MarketingNav";
import { BillingExplainer, PricingTable } from "@/components/platform/PricingTable";
import { Hero } from "@/components/platform/home/Hero";
import { Showcase } from "@/components/platform/home/Showcase";
import { Bento } from "@/components/platform/home/Bento";
import { HowItWorks } from "@/components/platform/home/HowItWorks";
import { TrustBand } from "@/components/platform/home/TrustBand";
import { FaqSection } from "@/components/platform/home/FaqSection";
import { FinalCta } from "@/components/platform/home/FinalCta";
import { Reveal } from "@/components/fx/Reveal";
import { JsonLd } from "@/components/seo/JsonLd";
import { faqLd } from "@/lib/seo/jsonld";
import { getCopy, hrefFor, type Locale } from "@/lib/i18n";
import { primeTrialDays } from "@/server/platform-settings";
import { toPricingOffer } from "@/components/offers/OfferPrice";
import { OfferBanner } from "@/components/offers/OfferBanner";
import { loadBannerOffers } from "@/server/offers";
import { getPublicPlans, getPublicUsageRates } from "@/server/billing/public-plans";

/** Marketing home page, shared by "/" (en) and "/ar" (ar). */
export async function HomePage({ locale }: { locale: Locale }) {
  const trialDays = await primeTrialDays();
  const copy = getCopy(locale), p = copy.home.pricing, h = (x: string) => hrefFor(locale, x);
  const [plans, usageRates] = await Promise.all([getPublicPlans(), getPublicUsageRates()]);
  const [offer] = await loadBannerOffers();
  return (
    <div className="theme-auto min-h-screen">
      <JsonLd data={faqLd(copy.home.faq)} />
      <MarketingNav locale={locale} />
      {offer && <OfferBanner offer={offer} locale={locale} />}
      <main id="main">
        <Hero copy={copy} />
        <Showcase copy={copy} />
        <Bento copy={copy} />
        <HowItWorks copy={copy} />
        <TrustBand copy={copy} />
        <section id="pricing" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6 md:py-24">
          <div className="max-w-2xl">
            <h2 className="font-display text-headline font-bold">{p.heading}</h2>
            <p className="measure mt-4 text-lg text-on-surface-variant">{p.lead}</p>
          </div>
          <Reveal className="mt-10">
            {plans.length ? <PricingTable plans={plans} locale={locale} trialDays={trialDays} offer={offer ? toPricingOffer(offer) : null} /> : <p className="text-on-surface-variant">{p.updating}<Link href={h("/signup")} className="font-semibold text-primary underline">{p.trial}</Link>{p.to}</p>}
          </Reveal>
          {plans.length > 0 && (
            <Reveal className="mt-12">
              <h3 className="font-display text-title font-semibold">{p.explainer}</h3>
              <div className="mt-5"><BillingExplainer plans={plans} usageRates={usageRates} headingLevel={3} locale={locale} /></div>
            </Reveal>
          )}
          <p className="mt-4 text-sm"><Link href={h("/pricing")} className="inline-flex min-h-11 items-center font-semibold text-primary underline underline-offset-2">{p.compare}</Link></p>
        </section>
        <FaqSection items={copy.home.faq} heading={copy.home.faqHeading} />
        <FinalCta copy={copy} />
      </main>
      <MarketingFooter locale={locale} />
    </div>
  );
}
