"use client";
import { useState } from "react";
import Link from "next/link";
import { Segmented } from "@/components/ui";
import { fill, getCopy, hrefFor, type Locale } from "@/lib/i18n";
import { OfferPrice, type PricingOffer } from "@/components/offers/OfferPrice";
import { trFeature, trPlanName } from "./plan-text";

export interface PublicPlan {
  code: string; name: string; priceMonthly: number; priceYearly: number; orderFeePct: number;
  maxOrdersPerMonth: number | null; maxStaff: number | null; features: string[];
  /** subscription: flat monthly fee, no per-order commission. commission: AED 0 a month, orderFeePct on each paid order. */
  billingModel: "subscription" | "commission";
  /** free monthly pay-as-you-go allowance per usage kind */
  includedUsage: Record<string, number>;
}

export interface PublicUsageRate { kind: string; label: string; unit: string; priceAed: number }

const aed = (n: number) => `AED ${n.toLocaleString("en-AE")}`;

/** Plan cards with a monthly/yearly switch. The popular plan (middle of three) is the only filled card. */
export function PricingTable({ plans, locale = "en", trialDays, offer }: { plans: PublicPlan[]; locale?: Locale; trialDays?: number; offer?: PricingOffer | null }) {
  const t = getCopy(locale, trialDays).priceTable, signup = hrefFor(locale, "/signup");
  const [period, setPeriod] = useState<"monthly" | "yearly">("monthly");
  const yearly = period === "yearly";
  const subs = plans.filter((p) => p.billingModel !== "commission");
  const payg = plans.filter((p) => p.billingModel === "commission");
  return (
    <div>
      <div className="mb-8 flex flex-wrap items-center gap-3">
        <Segmented ariaLabel={t.periodAria} value={period} onChange={setPeriod} options={[{ value: "monthly", label: t.monthly }, { value: "yearly", label: t.yearly }]} />
        <span className="rounded-full bg-success-container px-3 py-1 text-xs font-semibold text-on-success-container">{t.saves}</span>
      </div>
      <div className="grid gap-5 md:grid-cols-3">
        {subs.map((p, i) => {
          const popular = subs.length === 3 && i === 1;
          const price = yearly ? Math.round(p.priceYearly / 12) : p.priceMonthly;
          return (
            <div key={p.code} className={`relative flex flex-col rounded-shape-xl p-6 sm:p-7 ${popular ? "bg-inverse-surface text-inverse-on-surface shadow-elev-3" : "border border-outline-variant bg-surface-lowest text-on-surface"}`}>
              {popular && <span className="absolute -top-3 start-6 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-on-primary">{t.popular}</span>}
              <h3 className="text-lg font-semibold">{trPlanName(t, p.name)}</h3>
              <p className="mt-4 flex items-baseline gap-1">
                <span dir="ltr" className="text-4xl font-bold tracking-tight tabular-nums">{aed(price)}</span>
                <span className={popular ? "text-inverse-on-surface/70" : "text-on-surface-variant"}>{t.perMonth}</span>
              </p>
              <p className={`mt-1 text-xs tabular-nums ${popular ? "text-inverse-on-surface/70" : "text-on-surface-variant"}`}>
                {yearly ? fill(t.billedYear, { amount: aed(p.priceYearly) }) : t.billedMonth}. {t.noFee}
              </p>
              <OfferPrice offer={offer} planCode={p.code} listCharge={yearly ? p.priceYearly : p.priceMonthly} cycle={period} locale={locale} />
              <ul className="mt-6 flex-1 space-y-2.5 text-sm">
                {p.features.map((f) => (
                  <li key={f} className="flex gap-2.5">
                    <svg className={`mt-0.5 size-4 shrink-0 ${popular ? "text-ink-yellow" : "text-success"}`} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 8.5l3.2 3L13 4.5" /></svg>
                    <span>{trFeature(t, f)}</span>
                  </li>
                ))}
              </ul>
              <Link href={`${signup}?plan=${p.code}`} className={`state-layer mt-8 inline-flex min-h-11 items-center justify-center rounded-full px-5 text-sm font-semibold ${popular ? "bg-primary text-on-primary" : "border border-outline text-on-surface"}`}>
                {t.startTrial}
              </Link>
            </div>
          );
        })}
      </div>
      {payg.map((p) => (
        <div key={p.code} className="mt-5 grid gap-6 rounded-shape-xl border border-dashed border-outline bg-surface-low p-6 sm:p-7 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <p className="proof-label">{t.otherWay}</p>
            <h3 className="mt-3 text-lg font-semibold">{trPlanName(t, p.name)}</h3>
            <p className="mt-1 flex flex-wrap items-baseline gap-x-2">
              <span dir="ltr" className="text-3xl font-bold tracking-tight tabular-nums">AED 0</span><span className="text-on-surface-variant">{fill(t.paygLine, { pct: p.orderFeePct })}</span>
            </p>
            <p className="measure mt-2 text-sm text-on-surface-variant">{t.paygBody}</p>
          </div>
          <Link href={`${signup}?plan=${p.code}`} className="state-layer inline-flex min-h-11 items-center justify-center rounded-full border border-outline px-5 text-sm font-semibold text-on-surface">{t.paygCta}</Link>
        </div>
      ))}
    </div>
  );
}

/** Plain-language comparison of the two ways to pay, plus the usage that is billed on top of both. */
export function BillingExplainer({ plans, usageRates, headingLevel = 2, locale = "en" }: { plans: PublicPlan[]; usageRates: PublicUsageRate[]; headingLevel?: 2 | 3; locale?: Locale }) {
  const b = getCopy(locale).billing;
  const payg = plans.find((p) => p.billingModel === "commission");
  const pct = payg?.orderFeePct ?? 3;
  const H = `h${headingLevel}` as "h2" | "h3";
  const n = (x: number) => x.toLocaleString("en-AE");
  return (
    <div className="grid gap-5 md:grid-cols-3">
      <div className="rounded-shape-xl border border-outline-variant bg-surface-lowest p-6">
        <H className="text-lg font-semibold">{b.subscription.title}</H>
        <p className="mt-2 text-sm text-on-surface-variant">{b.subscription.text}</p>
        <p className="mt-4 text-xs text-on-surface-variant tabular-nums">{b.subscription.example}</p>
      </div>
      <div className="rounded-shape-xl border border-outline-variant bg-surface-lowest p-6">
        <H className="text-lg font-semibold">{b.payg.title}</H>
        <p className="mt-2 text-sm text-on-surface-variant">{fill(b.payg.text, { pct })}</p>
        <p className="mt-4 text-xs text-on-surface-variant tabular-nums">{fill(b.payg.example, { big: n(18000 * pct / 100), small: n(2000 * pct / 100) })}</p>
      </div>
      <div className="rounded-shape-xl bg-secondary-container p-6 text-on-secondary-container">
        <H className="text-lg font-semibold">{b.usage.title}</H>
        <p className="mt-2 text-sm">{b.usage.text}</p>
        {usageRates.length > 0 ? (
          <ul className="mt-4 space-y-1 text-xs tabular-nums">
            {usageRates.map((r) => {
              const k = b.kinds[r.kind];
              return <li key={r.kind} className="flex justify-between gap-3"><span>{k?.label ?? r.label}</span><span className="shrink-0 font-semibold">AED {r.priceAed.toLocaleString("en-AE", { maximumFractionDigits: 4 })} {locale === "ar" ? b.usage.per : "per"} {k?.unit ?? r.unit}</span></li>;
            })}
          </ul>
        ) : (
          <p className="mt-4 text-xs">{b.usage.none}</p>
        )}
      </div>
    </div>
  );
}
