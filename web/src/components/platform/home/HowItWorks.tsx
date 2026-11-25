import { RegMark } from "@/components/ui";
import { en, type Copy } from "@/lib/i18n/en";

export function HowItWorks({ copy = en }: { copy?: Copy }) {
  const how = copy.home.how;
  return (
    <section aria-labelledby="how" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-24">
      <div className="flex items-center gap-3"><RegMark /><h2 id="how" className="font-display text-headline font-bold">{how.heading}</h2></div>
      <ol className="mt-10 grid gap-px overflow-hidden rounded-shape-xl border border-outline-variant bg-outline-variant md:grid-cols-3">
        {how.steps.map((s, i) => (
          <li key={s.title} className="bg-surface-lowest p-6 sm:p-8">
            <p className="font-mono text-sm font-semibold text-primary">{how.step} {i + 1}</p>
            <h3 className="mt-3 font-display text-title font-semibold">{s.title}</h3>
            <p className="measure mt-2 text-on-surface-variant">{s.text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
