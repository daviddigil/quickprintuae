import { MarketingFooter, MarketingNav } from "@/components/platform/MarketingNav";
import { PricingTable } from "@/components/platform/PricingTable";
import { getPublicPlans } from "@/server/billing/public-plans";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pricing" };

export default async function PricingPage() {
  const plans = await getPublicPlans();
  return (
    <div className="bg-white">
      <MarketingNav />
      <section className="mx-auto max-w-6xl px-5 py-16">
        <h1 className="text-center text-4xl font-extrabold tracking-tight">Pricing for print shops of every size</h1>
        <p className="mx-auto mb-10 mt-3 max-w-xl text-center text-on-surface-variant">14-day free trial on every plan. Prices are in AED and exclude 5% VAT.</p>
        <PricingTable plans={plans} />
        <div className="mx-auto mt-12 max-w-3xl rounded-xl bg-surface-low p-6 text-sm text-on-surface-variant">
          <p className="font-semibold text-on-surface">How the order fee works</p>
          <p className="mt-1">The order fee is a percentage of the value of paid orders each month, billed with your subscription. Example: AED 18,000 of paid orders on Growth (1%) adds AED 180. Refunded and unpaid orders don&apos;t count.</p>
        </div>
      </section>
      <MarketingFooter />
    </div>
  );
}
