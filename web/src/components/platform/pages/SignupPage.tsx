import { Logo } from "@/components/platform/Logo";
import Link from "next/link";
import { getPublicPlans } from "@/server/billing/public-plans";
import { SignupForm } from "@/app/signup/signup-form";
import { PoweredBy } from "@/components/PoweredBy";
import { getCopy, hrefFor, type Locale } from "@/lib/i18n";

/** Sign-up page, shared by "/signup" (en) and "/ar/signup" (ar). The form posts to the same API in both languages. */
export async function SignupPage({ locale, plan }: { locale: Locale; plan?: string }) {
  const copy = getCopy(locale), t = copy.signup;
  const plans = await getPublicPlans();
  const home = hrefFor(locale, "/");
  return (
    <main className="min-h-screen bg-surface-low lg:grid lg:grid-cols-2">
      <section className="hidden bg-inverse-surface p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <Logo onDark href={home} label={copy.common.homeAria} />
        <div>
          <h1 className="text-4xl font-extrabold leading-tight">{t.headline}</h1>
          <ul className="mt-8 space-y-3 text-inverse-on-surface/80">
            {t.bullets.map((b) => <li key={b}>✓ {b}</li>)}
          </ul>
        </div>
        <p className="text-sm text-inverse-on-surface/80">{t.haveAccount}<Link href="/login" className="text-white underline">{t.signIn}</Link></p>
      </section>
      <section className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-lg">
          <div className="mb-6 lg:hidden"><Logo href={home} label={copy.common.homeAria} /></div>
          <h2 className="text-2xl font-bold">{t.createH}</h2>
          <p className="mb-6 text-sm text-on-surface-variant">{t.sub}</p>
          <SignupForm plans={plans.map((p) => ({ code: p.code, name: p.name, price: p.priceMonthly, feePct: p.orderFeePct, commission: p.billingModel === "commission" }))} defaultPlan={plan} locale={locale} />
          <PoweredBy className="mt-8" label={copy.common.poweredBy} />
        </div>
      </section>
    </main>
  );
}
