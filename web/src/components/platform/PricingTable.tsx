"use client";
import { useState } from "react";
import Link from "next/link";
import { Segmented } from "@/components/ui";

export interface PublicPlan {
  code: string; name: string; priceMonthly: number; priceYearly: number; orderFeePct: number;
  maxOrdersPerMonth: number | null; maxStaff: number | null; features: string[];
}

const aed = (n: number) => `AED ${n.toLocaleString("en-AE")}`;

/** Plan cards with a monthly/yearly switch. The popular plan (middle of three) is the only filled card. */
export function PricingTable({ plans, compact = false }: { plans: PublicPlan[]; compact?: boolean }) {
  const [period, setPeriod] = useState<"monthly" | "yearly">("monthly");
  const yearly = period === "yearly";
  return (
    <div>
      <div className="mb-8 flex flex-wrap items-center gap-3">
        <Segmented ariaLabel="Billing period" value={period} onChange={setPeriod} options={[{ value: "monthly", label: "Monthly" }, { value: "yearly", label: "Yearly" }]} />
        <span className="rounded-full bg-success-container px-3 py-1 text-xs font-semibold text-on-success-container">Yearly saves about 2 months</span>
      </div>
      <div className="grid gap-5 md:grid-cols-3">
        {plans.map((p, i) => {
          const popular = plans.length === 3 && i === 1;
          const price = yearly ? Math.round(p.priceYearly / 12) : p.priceMonthly;
          return (
            <div key={p.code} className={`relative flex flex-col rounded-shape-xl p-6 sm:p-7 ${popular ? "bg-inverse-surface text-inverse-on-surface shadow-elev-3" : "border border-outline-variant bg-surface-lowest text-on-surface"}`}>
              {popular && <span className="absolute -top-3 start-6 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-on-primary">Most popular</span>}
              <h3 className="text-lg font-semibold">{p.name}</h3>
              <p className="mt-4 flex items-baseline gap-1">
                <span className="text-4xl font-bold tracking-tight tabular-nums">{aed(price)}</span>
                <span className={popular ? "text-inverse-on-surface/70" : "text-on-surface-variant"}>/month</span>
              </p>
              <p className={`mt-1 text-xs tabular-nums ${popular ? "text-inverse-on-surface/70" : "text-on-surface-variant"}`}>
                {yearly ? `Billed ${aed(p.priceYearly)} a year` : "Billed monthly"}. Plus {p.orderFeePct}% on paid orders. Excludes VAT.
              </p>
              <ul className={`mt-6 flex-1 space-y-2.5 text-sm ${compact ? "" : ""}`}>
                {p.features.map((f) => (
                  <li key={f} className="flex gap-2.5">
                    <svg className={`mt-0.5 size-4 shrink-0 ${popular ? "text-ink-yellow" : "text-success"}`} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 8.5l3.2 3L13 4.5" /></svg>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Link href={`/signup?plan=${p.code}`} className={`state-layer mt-8 inline-flex min-h-11 items-center justify-center rounded-full px-5 text-sm font-semibold ${popular ? "bg-primary text-on-primary" : "border border-outline text-on-surface"}`}>
                Start 14 days free
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}
