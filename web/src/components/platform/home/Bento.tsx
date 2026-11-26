import Link from "next/link";
import { Badge, CropMarks, InkBar, ProofLabel } from "@/components/ui";
import { SpotlightCard } from "@/components/fx/SpotlightCard";
import { getCopy } from "@/lib/i18n";
import type { Copy } from "@/lib/i18n/en";
import { Icon, type IconName } from "./icons";

function Head({ icon, title, text, light }: { icon: IconName; title: string; text: string; light?: boolean }) {
  return (
    <>
      <span className={`grid size-10 place-items-center rounded-shape-sm ${light ? "bg-white/10 text-inverse-on-surface" : "bg-surface-container text-on-surface"}`}><Icon name={icon} /></span>
      <h3 className="mt-4 font-display text-title font-semibold">{title}</h3>
      <p className={`measure mt-2 text-sm ${light ? "text-inverse-on-surface/75" : "text-on-surface-variant"}`}>{text}</p>
    </>
  );
}

/** Asymmetric feature grid. Surface, radius and texture change by role so no two neighbours look the same. */
export function Bento({ copy = getCopy("en") }: { copy?: Copy }) {
  const t = copy.home.bento;
  return (
    <section id="features" className="scroll-mt-20 border-y border-outline-variant/60 bg-surface-low">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-24">
        <div className="max-w-2xl">
          <h2 className="font-display text-headline font-bold">{t.heading}</h2>
          <p className="measure mt-4 text-lg text-on-surface-variant">{t.lead}</p>
        </div>
        <div className="mt-10 grid gap-4 md:grid-cols-6 lg:grid-cols-12">
          <SpotlightCard className="rounded-shape-xl border border-outline-variant bg-surface-lowest p-6 md:col-span-3 lg:col-span-4">
            <Head icon="card" title={t.pay.title} text={t.pay.text} />
            <div className="mt-5 flex flex-wrap gap-2"><Badge tone="blue">Stripe</Badge><Badge>Apple Pay</Badge><Badge>Google Pay</Badge></div>
          </SpotlightCard>

          <div className="rounded-shape-lg bg-surface-container p-6 md:col-span-3 lg:col-span-4">
            <Head icon="tag" title={t.quote.title} text={t.quote.text} />
            <table className="mt-5 w-full text-sm tabular-nums">
              <caption className="sr-only">{t.quote.caption}</caption>
              <thead><tr className="text-xs text-on-surface-variant"><th className="pb-1.5 text-start font-medium">{t.quote.head}</th><th className="pb-1.5 text-end font-medium">{t.quote.each}</th></tr></thead>
              <tbody className="divide-y divide-outline-variant/60">
                {[["100", "0.60"], ["500", "0.24"], ["1,000", "0.16"]].map(([q, p]) => <tr key={q}><td className="py-1.5">{q} {t.quote.pcs}</td><td dir="ltr" className="py-1.5 text-end">AED {p}</td></tr>)}
              </tbody>
            </table>
          </div>

          <div className="rounded-shape-2xl border border-outline-variant bg-surface-lowest p-6 md:col-span-6 lg:col-span-4">
            <Head icon="image" title={t.cards.title} text={t.cards.text} />
            <CropMarks className="mx-auto mt-7 max-w-[15rem]">
              <div className="aspect-[85/55] rounded-[3px] border border-outline-variant bg-white p-3 text-[#201a1b] shadow-elev-1">
                <InkBar size={4} />
                <p className="mt-3 text-sm font-bold leading-tight">{t.cards.name}</p><p className="text-[10px] text-[#5f5557]">{t.cards.role}</p>
                <p dir="ltr" className="mt-4 text-[9px] tabular-nums text-[#5f5557] text-start">+971 50 123 4567</p>
              </div>
              <ProofLabel className="mt-4 w-full justify-center">{t.cards.size}</ProofLabel>
            </CropMarks>
          </div>

          <div className="relative overflow-hidden rounded-shape-2xl bg-inverse-surface p-6 text-inverse-on-surface sm:p-8 md:col-span-6 lg:col-span-7">
            <div aria-hidden className="halftone halftone-fade halftone-magenta pointer-events-none absolute inset-x-0 bottom-0 h-1/2 opacity-60" />
            <div className="relative">
              <Head light icon="qr" title={t.qr.title} text={t.qr.text} />
              <ul className="mt-6 grid gap-2 text-sm sm:grid-cols-3">
                {t.qr.steps.map((s, i) => (
                  <li key={s} className="flex items-center gap-3 rounded-shape-md bg-white/10 px-3 py-2.5"><span className="grid size-6 place-items-center rounded-full bg-primary text-xs font-bold text-on-primary">{i + 1}</span>{s}</li>
                ))}
              </ul>
            </div>
          </div>

          <div className="rounded-shape-xl bg-primary-container p-6 text-on-primary-container md:col-span-6 lg:col-span-5">
            <span className="grid size-10 place-items-center rounded-shape-sm bg-white/50 text-on-primary-container"><Icon name="chat" /></span>
            <h3 className="mt-4 font-display text-title font-semibold">{t.wa.title}</h3>
            <p className="measure mt-2 text-sm opacity-90">{t.wa.text}</p>
            <div className="mt-5 space-y-2 text-xs">
              <p className="w-fit max-w-[80%] rounded-2xl rounded-es-sm bg-white/60 px-3 py-2">{t.wa.q}</p>
              <p className="ms-auto w-fit max-w-[85%] rounded-2xl rounded-ee-sm bg-on-primary-container px-3 py-2 text-primary-container">{t.wa.a}</p>
            </div>
          </div>

          <div className="rounded-shape-lg border border-dashed border-outline bg-surface-lowest p-6 md:col-span-3 lg:col-span-4">
            <Head icon="receipt" title={t.vat.title} text={t.vat.text} />
            <p dir="ltr" className="proof-label mt-5">TRN 100000000000003</p>
          </div>

          <div className="rounded-shape-xl bg-surface-container p-6 md:col-span-3 lg:col-span-4">
            <Head icon="truck" title={t.delivery.title} text={t.delivery.text} />
            <div className="mt-5 flex flex-wrap gap-2"><Badge tone="cyan">{t.delivery.badges[0]}</Badge><Badge tone="yellowink">{t.delivery.badges[1]}</Badge><Badge tone="magenta">{t.delivery.badges[2]}</Badge></div>
          </div>

          <SpotlightCard className="rounded-shape-xl border border-outline-variant bg-surface-lowest p-6 md:col-span-6 lg:col-span-4">
            <Head icon="layers" title={t.offers.title} text={t.offers.text} />
            <div className="mt-5 flex items-center gap-1.5" aria-hidden><i className="h-2 w-6 rounded-full bg-primary" /><i className="size-2 rounded-full bg-outline-variant" /><i className="size-2 rounded-full bg-outline-variant" /></div>
          </SpotlightCard>
        </div>
        <p className="mt-8 text-sm text-on-surface-variant">{t.demo}<Link href="/s/demo" className="inline-flex min-h-11 items-center font-semibold text-primary underline underline-offset-2">{t.demoLink}</Link>.</p>
      </div>
    </section>
  );
}
