import Link from "next/link";
import { Badge, CropMarks, InkBar, ProofLabel } from "@/components/ui";
import { SpotlightCard } from "@/components/fx/SpotlightCard";
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
export function Bento() {
  return (
    <section id="features" className="scroll-mt-20 border-y border-outline-variant/60 bg-surface-low">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-24">
        <div className="max-w-2xl">
          <h2 className="font-display text-headline font-bold">Everything a UAE print counter needs</h2>
          <p className="measure mt-4 text-lg text-on-surface-variant">Prices, payments, delivery, invoices and queues in one place, set up for the UAE from day one.</p>
        </div>
        <div className="mt-10 grid gap-4 md:grid-cols-6 lg:grid-cols-12">
          <SpotlightCard className="rounded-shape-xl border border-outline-variant bg-surface-lowest p-6 md:col-span-3 lg:col-span-4">
            <Head icon="card" title="Paid before it reaches you" text="Card, Apple Pay and Google Pay go to your own Stripe or Mamo Pay account. There is no cash on delivery." />
            <div className="mt-5 flex flex-wrap gap-2"><Badge tone="blue">Stripe</Badge><Badge tone="magenta">Mamo Pay</Badge><Badge>Apple Pay</Badge><Badge>Google Pay</Badge></div>
          </SpotlightCard>

          <div className="rounded-shape-lg bg-surface-container p-6 md:col-span-3 lg:col-span-4">
            <Head icon="tag" title="Quotes follow your price list" text="Set prices by size, paper, sides and quantity. Customers get the exact figure." />
            <table className="mt-5 w-full text-sm tabular-nums">
              <caption className="sr-only">Example quantity tiers for business cards</caption>
              <thead><tr className="text-xs text-on-surface-variant"><th className="pb-1.5 text-start font-medium">Business cards, 350 gsm</th><th className="pb-1.5 text-end font-medium">Each</th></tr></thead>
              <tbody className="divide-y divide-outline-variant/60">
                {[["100", "0.60"], ["500", "0.24"], ["1,000", "0.16"]].map(([q, p]) => <tr key={q}><td className="py-1.5">{q} pcs</td><td className="py-1.5 text-end">AED {p}</td></tr>)}
              </tbody>
            </table>
          </div>

          <div className="rounded-shape-2xl border border-outline-variant bg-surface-lowest p-6 md:col-span-6 lg:col-span-4">
            <Head icon="image" title="Customers design their own cards" text="They type name, title and phone and get three print-ready layouts in seconds." />
            <CropMarks className="mx-auto mt-7 max-w-[15rem]">
              <div className="aspect-[85/55] rounded-[3px] border border-outline-variant bg-white p-3 text-[#201a1b] shadow-elev-1">
                <InkBar size={4} />
                <p className="mt-3 text-sm font-bold leading-tight">Aisha Al Mansoori</p><p className="text-[10px] text-[#5f5557]">Managing Director</p>
                <p className="mt-4 text-[9px] tabular-nums text-[#5f5557]">+971 50 123 4567</p>
              </div>
              <ProofLabel className="mt-4 w-full justify-center">85 × 55 mm</ProofLabel>
            </CropMarks>
          </div>

          <div className="relative overflow-hidden rounded-shape-2xl bg-inverse-surface p-6 text-inverse-on-surface sm:p-8 md:col-span-6 lg:col-span-7">
            <div aria-hidden className="halftone halftone-fade halftone-magenta pointer-events-none absolute inset-x-0 bottom-0 h-1/2 opacity-60" />
            <div className="relative">
              <Head light icon="qr" title="A QR code for the busy counter" text="Customers scan, upload documents, pay on their phone and take a ticket. Paid jobs print automatically, shortest first. Each walk-in is saved by phone number." />
              <ul className="mt-6 grid gap-2 text-sm sm:grid-cols-3">
                {["Scan and upload", "Pay on the phone", "Prints in priority order"].map((s, i) => (
                  <li key={s} className="flex items-center gap-3 rounded-shape-md bg-white/10 px-3 py-2.5"><span className="grid size-6 place-items-center rounded-full bg-primary text-xs font-bold text-on-primary">{i + 1}</span>{s}</li>
                ))}
              </ul>
            </div>
          </div>

          <div className="rounded-shape-xl bg-primary-container p-6 text-on-primary-container md:col-span-6 lg:col-span-5">
            <span className="grid size-10 place-items-center rounded-shape-sm bg-white/50 text-on-primary-container"><Icon name="chat" /></span>
            <h3 className="mt-4 font-display text-title font-semibold">WhatsApp orders, quoted by AI</h3>
            <p className="measure mt-2 text-sm opacity-90">Connect the number you already use. The AI builds the cart with your prices and sends one checkout link. You take over by replying from your phone.</p>
            <div className="mt-5 space-y-2 text-xs">
              <p className="w-fit max-w-[80%] rounded-2xl rounded-es-sm bg-white/60 px-3 py-2">Can I get 500 business cards?</p>
              <p className="ms-auto w-fit max-w-[85%] rounded-2xl rounded-ee-sm bg-on-primary-container px-3 py-2 text-primary-container">500 cards: AED 126.00 with VAT. Checkout link below.</p>
            </div>
          </div>

          <div className="rounded-shape-lg border border-dashed border-outline bg-surface-lowest p-6 md:col-span-3 lg:col-span-4">
            <Head icon="receipt" title="5% VAT and your TRN on every invoice" text="Choose prices with VAT included or added at checkout. Download a tax invoice for any order." />
            <p className="proof-label mt-5">TRN 100000000000003</p>
          </div>

          <div className="rounded-shape-xl bg-surface-container p-6 md:col-span-3 lg:col-span-4">
            <Head icon="truck" title="Pickup, your drivers or a courier" text="Jeebly, Quiqup, Careem Box and Aramex connect with your own account. Fees and lead times are set per emirate." />
            <div className="mt-5 flex flex-wrap gap-2"><Badge tone="cyan">Pickup</Badge><Badge tone="yellowink">Own drivers</Badge><Badge tone="magenta">Courier</Badge></div>
          </div>

          <SpotlightCard className="rounded-shape-xl border border-outline-variant bg-surface-lowest p-6 md:col-span-6 lg:col-span-4">
            <Head icon="layers" title="Run offers on your home page" text="Upload banners, set start and end dates and reorder them. Live offers slide across the top of your store." />
            <div className="mt-5 flex items-center gap-1.5" aria-hidden><i className="h-2 w-6 rounded-full bg-primary" /><i className="size-2 rounded-full bg-outline-variant" /><i className="size-2 rounded-full bg-outline-variant" /></div>
          </SpotlightCard>
        </div>
        <p className="mt-8 text-sm text-on-surface-variant">Want to see it in use? <Link href="/s/demo" className="font-semibold text-primary underline underline-offset-2">Open the demo store</Link>.</p>
      </div>
    </section>
  );
}
