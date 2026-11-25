import type { PublicPlan } from "./PricingTable";

const aed = (n: number) => `AED ${n.toLocaleString("en-AE")}`;
const yes = <svg className="mx-auto size-4 text-success" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label="Included"><path d="M3 8.5l3.2 3L13 4.5" /></svg>;
const no = <span className="text-outline" aria-label="Not included">&ndash;</span>;

/** Side-by-side comparison built from the plans table. Feature rows are the union of every plan's feature list. */
export function PlanComparison({ plans }: { plans: PublicPlan[] }) {
  if (!plans.length) return null;
  const features = Array.from(new Set(plans.flatMap((p) => p.features.filter((f) => !/^Everything in /i.test(f)))));
  const row = (label: string, cells: (p: PublicPlan) => React.ReactNode) => (
    <tr key={label} className="border-t border-outline-variant/60">
      <th scope="row" className="py-3 pe-4 text-start font-medium text-on-surface">{label}</th>
      {plans.map((p) => <td key={p.code} className="px-3 py-3 text-center tabular-nums">{cells(p)}</td>)}
    </tr>
  );
  return (
    <div className="overflow-x-auto rounded-shape-xl border border-outline-variant bg-surface-lowest">
      <table className="w-full min-w-[34rem] text-sm">
        <caption className="sr-only">Compare QuickPrint plans</caption>
        <thead>
          <tr className="bg-surface-low">
            <th scope="col" className="px-4 py-4 text-start text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Plan</th>
            {plans.map((p) => <th key={p.code} scope="col" className="px-3 py-4 text-center text-base font-semibold">{p.name}</th>)}
          </tr>
        </thead>
        <tbody className="[&_th:first-child]:ps-4">
          {row("Monthly price", (p) => aed(p.priceMonthly))}
          {row("Yearly price", (p) => aed(p.priceYearly))}
          {row("Fee on paid orders", (p) => `${p.orderFeePct}%`)}
          {row("Orders per month", (p) => (p.maxOrdersPerMonth == null ? "Unlimited" : p.maxOrdersPerMonth.toLocaleString("en-AE")))}
          {row("Team members", (p) => (p.maxStaff == null ? "Unlimited" : p.maxStaff.toLocaleString("en-AE")))}
          {features.map((f) => row(f, (p) => (p.features.includes(f) || p.features.some((x) => /^Everything in /i.test(x)) && plans.indexOf(p) > 0 && plans.slice(0, plans.indexOf(p)).some((q) => q.features.includes(f)) ? yes : no)))}
        </tbody>
      </table>
    </div>
  );
}
