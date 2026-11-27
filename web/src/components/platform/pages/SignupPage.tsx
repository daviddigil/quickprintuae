import { Logo } from "@/components/platform/Logo";
import Link from "next/link";
import { getPublicPlans } from "@/server/billing/public-plans";
import { SignupForm } from "@/app/signup/signup-form";
import { PoweredBy } from "@/components/PoweredBy";
import { primeTrialDays } from "@/server/platform-settings";
import { getCopy, hrefFor, type Locale } from "@/lib/i18n";
import { setupMode } from "@/server/billing/gateway";
import { LiveOfferBanner } from "@/components/offers/LiveOfferBanner";
import { WaitlistForm } from "@/components/platform/WaitlistForm";

/** Sign-up page, shared by "/signup" (en) and "/ar/signup" (ar). The form posts to the same API in both languages. */
export async function SignupPage({ locale, plan }: { locale: Locale; plan?: string }) {
  const trialDays = await primeTrialDays();
  const copy = getCopy(locale), t = copy.signup;
  const plans = await getPublicPlans();
  const mode = await setupMode(); // production with no live gateway: waitlist instead of signup
  const home = hrefFor(locale, "/");
  return (
    <>
    <LiveOfferBanner locale={locale} />
    <main className="min-h-screen bg-surface-low lg:grid lg:grid-cols-2">
      <section className="hidden bg-inverse-surface p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <Logo onDark href={home} label={copy.common.homeAria} height={44} priority />
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
          {mode.open ? (
            <>
              <h2 className="text-2xl font-bold">{t.createH}</h2>
              <p className="mb-6 text-sm text-on-surface-variant">{t.sub}</p>
              <SignupForm plans={plans.map((p) => ({ code: p.code, name: p.name, price: p.priceMonthly, feePct: p.orderFeePct, commission: p.billingModel === "commission" }))} defaultPlan={plan} locale={locale} live={!!mode.live} fake={mode.fake} trialDays={trialDays} />
            </>
          ) : <WaitlistForm locale={locale} trialDays={trialDays} />}
          <PoweredBy className="mt-8" label={copy.common.poweredBy} />
        </div>
      </section>
    </main>
    </>
  );
}
