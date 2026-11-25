import { pageMetadata } from "@/lib/seo/metadata";
import { MarketingFooter, MarketingNav } from "@/components/platform/MarketingNav";
import { BillingExplainer, PricingTable } from "@/components/platform/PricingTable";
import { PlanComparison } from "@/components/platform/PlanComparison";
import { FaqSection } from "@/components/platform/home/FaqSection";
import { FinalCta } from "@/components/platform/home/FinalCta";
import { getPublicPlans, getPublicUsageRates } from "@/server/billing/public-plans";

export const dynamic = "force-dynamic";
export const metadata = pageMetadata({
  title: "Pricing in AED: subscription or pay per order",
  description: "QuickPrint UAE plans for print shops: a monthly subscription with no fee on orders, or pay per order with no monthly fee. WhatsApp and AI are pay as you go.",
  path: "/pricing",
});

const PRICING_FAQ = [
  { q: "Is there a free trial?", a: "Yes. Every plan starts with 14 days free and no card. You can switch plans during the trial." },
  { q: "Do prices include VAT?", a: "No. Prices are in AED and exclude 5% VAT. VAT is added to your invoice, and each invoice shows your subscription, any order fee and any usage." },
  { q: "When does the order fee apply?", a: "Only on the Pay per order plan. It is a percentage of paid orders in the month, billed with your invoice. Refunded and unpaid orders do not count. Subscription plans never charge a fee on orders." },
  { q: "What is billed by usage?", a: "WhatsApp messages sent through the Meta API and AI features, such as chat replies and card designs. Some plans include a free allowance each month. Anything above it is billed at the rate on your billing page." },
  { q: "Can I change plans?", a: "Yes. During the trial a change applies at once. On a paid plan a change starts at the next billing month, and you can cancel a scheduled change before then." },
  { q: "Do payment provider fees come out of this?", a: "No. Stripe and Mamo Pay charge their own fees. Customers pay into your own account." },
];

export default async function PricingPage() {
  const [plans, usageRates] = await Promise.all([getPublicPlans(), getPublicUsageRates()]);
  return (
    <div className="theme-auto min-h-screen">
      <MarketingNav />
      <main id="main">
        <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 md:py-20">
          <p className="proof-label">Pricing · AED · excl. 5% VAT</p>
          <h1 className="mt-5 max-w-3xl font-display text-display font-bold">Pricing for print shops of every size</h1>
          <p className="measure mt-5 text-lg text-on-surface-variant">Pay a fixed monthly fee, or pay a percentage only when an order is paid. Every plan starts with 14 days free.</p>
          <div className="mt-10">
            {plans.length ? <PricingTable plans={plans} /> : <p className="text-on-surface-variant">Plans are being updated. Please check back shortly.</p>}
          </div>
        </section>
        {plans.length > 0 && (
          <>
            <section className="border-y border-outline-variant/60 bg-surface-low">
              <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 md:py-20">
                <h2 className="font-display text-headline font-bold">How you are billed</h2>
                <p className="measure mt-3 text-on-surface-variant">Two ways to pay for the platform, and usage that is billed on top of both.</p>
                <div className="mt-8"><BillingExplainer plans={plans} usageRates={usageRates} /></div>
              </div>
            </section>
            <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 md:py-20">
              <h2 className="font-display text-headline font-bold">Compare plans</h2>
              <div className="mt-8"><PlanComparison plans={plans} /></div>
            </section>
          </>
        )}
        <FaqSection items={PRICING_FAQ} heading="Billing questions" />
        <FinalCta />
      </main>
      <MarketingFooter />
    </div>
  );
}
