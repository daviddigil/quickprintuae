import { CountUp } from "@/components/fx/CountUp";
import { SpecTicker } from "@/components/fx/SpecTicker";
import { en, type Copy } from "@/lib/i18n/en";

/** Full-bleed band with figures that are facts about the product, not claims about customers. */
export function TrustBand({ copy = en }: { copy?: Copy }) {
  const t = copy.home.trust;
  return (
    <section className="bg-inverse-surface text-inverse-on-surface">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 md:py-20">
        <h2 className="font-display text-headline font-bold">{t.heading}</h2>
        <dl className="mt-10 grid gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
          {t.facts.map((f, i) => (
            <div key={i} className="border-t border-white/20 pt-4">
              <dt className="font-display text-5xl font-bold tracking-tight">{f.text ? <span>{f.text}</span> : <CountUp value={f.value} suffix={f.suffix} />}</dt>
              <dd className="mt-2 text-sm text-inverse-on-surface/75">{f.label}</dd>
            </div>
          ))}
        </dl>
      </div>
      <SpecTicker items={t.specs} ariaLabel={t.specsAria} className="border-t border-white/15 py-4 text-inverse-on-surface/70" />
    </section>
  );
}
