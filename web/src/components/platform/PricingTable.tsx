"use client";
import { useState } from "react";
import Link from "next/link";

export interface PublicPlan {
  code: string; name: string; priceMonthly: number; priceYearly: number; orderFeePct: number;
  maxOrdersPerMonth: number | null; maxStaff: number | null; features: string[];
}

export function PricingTable({ plans }: { plans: PublicPlan[] }) {
  const [yearly, setYearly] = useState(false);
  return (
    <div>
      <div className="mb-10 flex items-center justify-center gap-3 text-sm">
        <span className={!yearly ? "font-semibold" : "text-slate-500"}>Monthly</span>
        <button type="button" aria-label="Toggle yearly billing" onClick={() => setYearly(!yearly)}
          className={`relative h-7 w-12 rounded-full transition ${yearly ? "bg-brand-600" : "bg-slate-300"}`}>
          <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${yearly ? "left-6" : "left-1"}`} />
        </button>
        <span className={yearly ? "font-semibold" : "text-slate-500"}>Yearly <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">2 months free</span></span>
      </div>
      <div className="grid gap-6 md:grid-cols-3">
        {plans.map((p, i) => {
          const featured = plans.length === 3 ? i === 1 : false;
          const price = yearly ? Math.round(p.priceYearly / 12) : p.priceMonthly;
          return (
            <div key={p.code} className={`relative flex flex-col rounded-2xl border bg-white p-7 shadow-sm ${featured ? "border-brand-600 ring-2 ring-brand-600" : "border-slate-200"}`}>
              {featured && <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brand-600 px-3 py-1 text-xs font-semibold text-white">Most popular</span>}
              <h3 className="text-lg font-bold">{p.name}</h3>
              <p className="mt-4"><span className="text-4xl font-extrabold">AED {price.toLocaleString("en-AE")}</span><span className="text-slate-500">/mo</span></p>
              <p className="mt-1 text-xs text-slate-500">{yearly ? `Billed AED ${p.priceYearly.toLocaleString("en-AE")} yearly` : "Billed monthly"} · + {p.orderFeePct}% per paid order · excl. VAT</p>
              <ul className="mt-6 flex-1 space-y-2 text-sm">
                {p.features.map((f) => <li key={f} className="flex gap-2"><span className="text-emerald-600">✓</span>{f}</li>)}
              </ul>
              <Link href={`/signup?plan=${p.code}`} className={`mt-8 rounded-lg px-4 py-2.5 text-center text-sm font-semibold ${featured ? "bg-brand-600 text-white hover:bg-brand-700" : "bg-slate-900 text-white hover:bg-slate-800"}`}>
                Start 14-day free trial
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}
