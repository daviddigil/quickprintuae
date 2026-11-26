import { homeFaq } from "./faq-data";

/** Native <details> accordion: works without JavaScript and every answer is in the HTML for search engines and AI assistants. */
export function FaqSection({ items = homeFaq(), heading = "Questions shop owners ask" }: { items?: { q: string; a: string }[]; heading?: string }) {
  return (
    <section id="faq" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6 md:py-24">
      <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
        <h2 className="font-display text-headline font-bold">{heading}</h2>
        <div className="divide-y divide-outline-variant border-y border-outline-variant">
          {items.map((f) => (
            <details key={f.q} className="group py-1">
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-3 text-base font-semibold marker:hidden [&::-webkit-details-marker]:hidden">
                {f.q}
                <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-container text-lg leading-none transition-transform duration-(--dur-3) ease-emphasized group-open:rotate-45">+</span>
              </summary>
              <p className="measure pb-4 pe-10 text-on-surface-variant">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
