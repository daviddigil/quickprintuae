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
import { getPublicPlans, getPublicUsageRates } from "@/server/billing/public-plans";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [plans, usageRates] = await Promise.all([getPublicPlans(), getPublicUsageRates()]);
  return (
    <div className="theme-auto min-h-screen">
      <MarketingNav />
      <main id="main">
        <Hero />
        <Showcase />
        <Bento />
        <HowItWorks />
        <TrustBand />
        <section id="pricing" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6 md:py-24">
          <div className="max-w-2xl">
            <h2 className="font-display text-headline font-bold">Simple pricing in AED</h2>
            <p className="measure mt-4 text-lg text-on-surface-variant">Pick a monthly subscription, or pay a percentage only when orders are paid. Prices exclude 5% VAT. Your payment provider charges its own fees.</p>
          </div>
          <Reveal className="mt-10">
            {plans.length ? <PricingTable plans={plans} /> : <p className="text-on-surface-variant">Plans are being updated. <Link href="/signup" className="font-semibold text-primary underline">Start a free trial</Link> to see them.</p>}
          </Reveal>
          {plans.length > 0 && (
            <Reveal className="mt-12">
              <h3 className="font-display text-title font-semibold">Subscription or pay per order?</h3>
              <div className="mt-5"><BillingExplainer plans={plans} usageRates={usageRates} headingLevel={3} /></div>
            </Reveal>
          )}
          <p className="mt-4 text-sm"><Link href="/pricing" className="inline-flex min-h-11 items-center font-semibold text-primary underline underline-offset-2">Compare every plan</Link></p>
        </section>
        <FaqSection />
        <FinalCta />
      </main>
      <MarketingFooter />
    </div>
  );
}
