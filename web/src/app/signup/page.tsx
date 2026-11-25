import { Logo } from "@/components/platform/Logo";
import Link from "next/link";
import { getPublicPlans } from "@/server/billing/public-plans";
import { SignupForm } from "./signup-form";
import { PoweredBy } from "@/components/PoweredBy";

export const dynamic = "force-dynamic";
export const metadata = { title: "Start your free trial" };

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const { plan } = await searchParams;
  const plans = await getPublicPlans();
  return (
    <main className="min-h-screen bg-surface-low lg:grid lg:grid-cols-2">
      <section className="hidden bg-inverse-surface p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <Logo />
        <div>
          <h1 className="text-4xl font-extrabold leading-tight">Your print shop, open online 24/7.</h1>
          <ul className="mt-8 space-y-3 text-outline">
            <li>✓ Storefront loaded with documents, photos, passport photos, cards, flyers and more</li>
            <li>✓ Prepaid orders through your own Stripe or Mamo Pay</li>
            <li>✓ Pickup and scheduled delivery across all 7 emirates</li>
            <li>✓ 14 days free, no card required</li>
          </ul>
        </div>
        <p className="text-sm text-on-surface-variant">Already have an account? <Link href="/login" className="text-white underline">Sign in</Link></p>
      </section>
      <section className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-lg">
          <div className="mb-6 lg:hidden"><Logo /></div>
          <h2 className="text-2xl font-bold">Create your print shop</h2>
          <p className="mb-6 text-sm text-on-surface-variant">Takes about 2 minutes.</p>
          <SignupForm plans={plans.map((p) => ({ code: p.code, name: p.name, price: p.priceMonthly }))} defaultPlan={plan} />
          <PoweredBy className="mt-8" />
        </div>
      </section>
    </main>
  );
}
