import { MarketingFooter, MarketingNav } from "@/components/platform/MarketingNav";
import { BillingExplainer, PricingTable } from "@/components/platform/PricingTable";
import { PlanComparison } from "@/components/platform/PlanComparison";
import { FaqSection } from "@/components/platform/home/FaqSection";
import { FinalCta } from "@/components/platform/home/FinalCta";
import { JsonLd } from "@/components/seo/JsonLd";
import { faqLd } from "@/lib/seo/jsonld";
import { getCopy, type Locale } from "@/lib/i18n";
import { primeTrialDays } from "@/server/platform-settings";
import { getPublicPlans, getPublicUsageRates } from "@/server/billing/public-plans";

/** Pricing page, shared by "/pricing" (en) and "/ar/pricing" (ar). */
export async function PricingPage({ locale }: { locale: Locale }) {
  const trialDays = await primeTrialDays();
  const copy = getCopy(locale), t = copy.pricingPage;
  const [plans, usageRates] = await Promise.all([getPublicPlans(), getPublicUsageRates()]);
  return (
    <div className="theme-auto min-h-screen">
      <JsonLd data={faqLd(t.faq)} />
      <MarketingNav locale={locale} />
      <main id="main">
        <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 md:py-20">
          <p className="proof-label">{t.label}</p>
          <h1 className="mt-5 max-w-3xl font-display text-display font-bold">{t.h1}</h1>
          <p className="measure mt-5 text-lg text-on-surface-variant">{t.lead}</p>
          <div className="mt-10">
            {plans.length ? <PricingTable plans={plans} locale={locale} trialDays={trialDays} /> : <p className="text-on-surface-variant">{t.updating}</p>}
          </div>
        </section>
        {plans.length > 0 && (
          <>
            <section className="border-y border-outline-variant/60 bg-surface-low">
              <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 md:py-20">
                <h2 className="font-display text-headline font-bold">{t.billingH}</h2>
                <p className="measure mt-3 text-on-surface-variant">{t.billingLead}</p>
                <div className="mt-8"><BillingExplainer plans={plans} usageRates={usageRates} locale={locale} /></div>
              </div>
            </section>
            <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 md:py-20">
              <h2 className="font-display text-headline font-bold">{t.compareH}</h2>
              <div className="mt-8"><PlanComparison plans={plans} locale={locale} /></div>
            </section>
          </>
        )}
        <FaqSection items={t.faq} heading={t.faqHeading} />
        <FinalCta copy={copy} />
      </main>
      <MarketingFooter locale={locale} />
    </div>
  );
}
