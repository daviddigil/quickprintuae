import { CountUp } from "@/components/fx/CountUp";
import { SpecTicker } from "@/components/fx/SpecTicker";

const FACTS = [
  { fig: <CountUp value={5} suffix="%" />, label: "VAT on every order, added or included as you choose" },
  { fig: <span>TRN</span>, label: "printed on every tax invoice, ready for your FTA records" },
  { fig: <CountUp value={7} />, label: "emirates, each with its own delivery fee and lead time" },
  { fig: <CountUp value={14} />, label: "days free on every plan, with no card needed" },
];
const SPECS = ["A5 · A4 · A3", "80 · 150 · 350 gsm", "85 × 55 mm cards", "UAE passport 43 × 55 mm", "AED · 5% VAT", "Pickup and delivery"];

/** Full-bleed band with figures that are facts about the product, not claims about customers. */
export function TrustBand() {
  return (
    <section className="bg-inverse-surface text-inverse-on-surface">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 md:py-20">
        <h2 className="font-display text-headline font-bold">Made for UAE print counters</h2>
        <dl className="mt-10 grid gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
          {FACTS.map((f, i) => (
            <div key={i} className="border-t border-white/20 pt-4">
              <dt className="font-display text-5xl font-bold tracking-tight">{f.fig}</dt>
              <dd className="mt-2 text-sm text-inverse-on-surface/75">{f.label}</dd>
            </div>
          ))}
        </dl>
      </div>
      <SpecTicker items={SPECS} className="border-t border-white/15 py-4 text-inverse-on-surface/70" />
    </section>
  );
}
