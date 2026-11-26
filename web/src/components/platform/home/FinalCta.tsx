import Link from "next/link";
import { getCopy } from "@/lib/i18n";
import type { Copy } from "@/lib/i18n/en";
import { hrefFor } from "@/lib/i18n";

export function FinalCta({ copy = getCopy("en") }: { copy?: Copy }) {
  const f = copy.home.final, h = (p: string) => hrefFor(copy.locale, p);
  return (
    <section className="px-4 pb-16 sm:px-6 md:pb-24">
      <div className="relative mx-auto max-w-6xl overflow-hidden rounded-shape-2xl bg-primary p-8 text-on-primary sm:p-12">
        <div aria-hidden className="halftone halftone-fade-x pointer-events-none absolute inset-y-0 end-0 w-1/2 opacity-30 [--halftone-dot:white]" />
        <div className="relative max-w-xl">
          <h2 className="font-display text-headline font-bold">{f.heading}</h2>
          <p className="mt-3 text-lg opacity-90">{f.text}</p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href={h("/signup")} className="state-layer inline-flex min-h-12 items-center rounded-full bg-white px-7 text-base font-semibold text-[#660d27]">{copy.common.startFree2}</Link>
            <Link href={h("/pricing")} className="state-layer inline-flex min-h-12 items-center rounded-full border border-white/60 px-6 text-base font-semibold">{f.pricing}</Link>
          </div>
        </div>
      </div>
    </section>
  );
}
