import Link from "next/link";
import { getPublicPlans } from "@/server/billing/public-plans";
import { SignupForm } from "./signup-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Start your free trial" };

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const { plan } = await searchParams;
  const plans = await getPublicPlans();
  return (
    <main className="min-h-screen bg-slate-50 lg:grid lg:grid-cols-2">
      <section className="hidden bg-slate-900 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <Link href="/" className="text-2xl font-extrabold">Quick<span className="text-brand-500">Print</span></Link>
        <div>
          <h1 className="text-4xl font-extrabold leading-tight">Your print shop, open online 24/7.</h1>
          <ul className="mt-8 space-y-3 text-slate-300">
            <li>✓ Storefront loaded with documents, photos, passport photos, cards, flyers and more</li>
            <li>✓ Prepaid orders through your own Stripe or Mamo Pay</li>
            <li>✓ Pickup and scheduled delivery across all 7 emirates</li>
            <li>✓ 14 days free, no card required</li>
          </ul>
        </div>
        <p className="text-sm text-slate-500">Already have an account? <Link href="/login" className="text-white underline">Sign in</Link></p>
      </section>
      <section className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-lg">
          <Link href="/" className="mb-6 block text-2xl font-extrabold lg:hidden">Quick<span className="text-brand-600">Print</span></Link>
          <h2 className="text-2xl font-bold">Create your print shop</h2>
          <p className="mb-6 text-sm text-slate-500">Takes about 2 minutes.</p>
          <SignupForm plans={plans.map((p) => ({ code: p.code, name: p.name, price: p.priceMonthly }))} defaultPlan={plan} />
        </div>
      </section>
    </main>
  );
}
