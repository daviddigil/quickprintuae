import type { PublicPlan } from "./PricingTable";
import { getCopy, type Locale } from "@/lib/i18n";
import { trFeature, trPlanName } from "./plan-text";

const aed = (n: number) => `AED ${n.toLocaleString("en-AE")}`;

/** Side-by-side comparison built from the plans table. Feature rows are the union of every plan's feature list. */
export function PlanComparison({ plans, locale = "en" }: { plans: PublicPlan[]; locale?: Locale }) {
  if (!plans.length) return null;
  const copy = getCopy(locale), k = copy.compare, pt = copy.priceTable;
  const yes = <svg className="mx-auto size-4 text-success" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label={k.included}><path d="M3 8.5l3.2 3L13 4.5" /></svg>;
  const no = <span className="text-outline" aria-label={k.notIncluded}>&ndash;</span>;
  // "Everything in Growth" means the plan includes Growth's features too, so resolve that into a full set per plan.
  const own = (p: PublicPlan) => p.features.filter((f) => !/^Everything in |^No monthly fee|^Commission only|pay as you go$/i.test(f));
  const resolved = new Map<string, Set<string>>();
  const resolve = (p: PublicPlan, seen = new Set<string>()): Set<string> => {
    if (resolved.has(p.code)) return resolved.get(p.code)!;
    const set = new Set(own(p));
    seen.add(p.code);
    for (const f of p.features) {
      const m = /^Everything in (.+)$/i.exec(f);
      const base = m && plans.find((q) => q.name.toLowerCase() === m[1].toLowerCase());
      if (base && !seen.has(base.code)) resolve(base, seen).forEach((x) => set.add(x));
    }
    resolved.set(p.code, set);
    return set;
  };
  plans.forEach((p) => resolve(p));
  const features = Array.from(new Set(plans.flatMap((p) => [...resolved.get(p.code)!])));
  const row = (label: string, cells: (p: PublicPlan) => React.ReactNode) => (
    <tr key={label} className="border-t border-outline-variant/60">
      <th scope="row" className="py-3 pe-4 text-start font-medium text-on-surface">{label}</th>
      {plans.map((p) => <td key={p.code} className="px-3 py-3 text-center tabular-nums">{cells(p)}</td>)}
    </tr>
  );
  return (
    <div className="overflow-x-auto rounded-shape-xl border border-outline-variant bg-surface-lowest" tabIndex={0} role="region" aria-label={k.caption}>
      <table className="w-full min-w-[36rem] text-sm">
        <caption className="sr-only">{k.caption}</caption>
        <thead>
          <tr className="bg-surface-low">
            <th scope="col" className="px-4 py-4 text-start text-xs font-semibold uppercase tracking-wide text-on-surface-variant">{k.plan}</th>
            {plans.map((p) => <th key={p.code} scope="col" className="px-3 py-4 text-center text-base font-semibold">{trPlanName(pt, p.name)}</th>)}
          </tr>
        </thead>
        <tbody className="[&_th:first-child]:ps-4">
          {row(k.monthly, (p) => <span dir="ltr">{aed(p.priceMonthly)}</span>)}
          {row(k.yearly, (p) => (p.billingModel === "commission" ? k.none : <span dir="ltr">{aed(p.priceYearly)}</span>))}
          {row(k.fee, (p) => (p.billingModel === "commission" ? `${p.orderFeePct}%` : k.none))}
          {row(k.orders, (p) => (p.maxOrdersPerMonth == null ? k.unlimited : p.maxOrdersPerMonth.toLocaleString("en-AE")))}
          {row(k.team, (p) => (p.maxStaff == null ? k.unlimited : p.maxStaff.toLocaleString("en-AE")))}
          {features.map((f) => row(trFeature(pt, f), (p) => (resolved.get(p.code)!.has(f) ? yes : no)))}
        </tbody>
      </table>
    </div>
  );
}
