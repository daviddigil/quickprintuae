import Link from "next/link";
import { JobTicket } from "./JobTicket";
import { Icon } from "./icons";

const FACTS = ["Prices in AED", "5% VAT built in", "TRN on every tax invoice"];

/** Left-aligned hero with a real UI panel. Everything is readable on first paint; nothing waits for JavaScript. */
export function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-outline-variant/60">
      <div aria-hidden className="halftone halftone-fade-x pointer-events-none absolute inset-y-0 end-0 w-2/3 opacity-70" />
      <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 py-14 sm:px-6 md:py-20 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:py-24">
        <div>
          <p className="proof-label">Online print shop software · UAE</p>
          <h1 className="mt-5 font-display text-display font-bold text-on-surface">
            Take print orders online and <span className="ink-underline">get paid before you print.</span>
          </h1>
          <p className="measure mt-6 text-lg text-on-surface-variant">
            Open a branded storefront for your shop in about five minutes. Customers upload files, see an exact price in AED, pay by card or Apple Pay, then pick up or book delivery.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/signup" className="state-layer inline-flex min-h-12 items-center gap-2 rounded-full bg-primary px-7 text-base font-semibold text-on-primary shadow-elev-2">
              Start free in 2 minutes <Icon name="arrow" className="size-5 rtl:-scale-x-100" />
            </Link>
            <Link href="/s/demo" className="state-layer inline-flex min-h-12 items-center rounded-full border border-outline px-6 text-base font-semibold text-on-surface">See a live store</Link>
          </div>
          <p className="mt-4 text-sm text-on-surface-variant">14 days free. No card needed.</p>
          <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-on-surface-variant">
            {FACTS.map((f) => <li key={f} className="flex items-center gap-2"><Icon name="check" className="size-4 text-success" />{f}</li>)}
          </ul>
        </div>
        <JobTicket />
      </div>
    </section>
  );
}
