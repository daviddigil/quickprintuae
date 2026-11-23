import Link from "next/link";
import { MarketingFooter, MarketingNav } from "@/components/platform/MarketingNav";
import { PricingTable } from "@/components/platform/PricingTable";
import { getPublicPlans } from "@/server/billing/public-plans";

export const dynamic = "force-dynamic";

const PRODUCTS = [
  { icon: "📄", name: "Documents", text: "A5 to A0, B&W or colour, binding — priced per page automatically." },
  { icon: "🔒", name: "Confidential docs", text: "Encrypted uploads, sealed envelopes, auto-deleted after collection." },
  { icon: "🪪", name: "Passport & visa photos", text: "UAE, India, US, UK, Schengen presets with the right size." },
  { icon: "🖼️", name: "Photos & frames", text: "Wallet to 20×30 in, every global size, plus framed prints." },
  { icon: "💼", name: "Business cards", text: "AI designer + drag-and-drop editor, foil, spot UV, rounded corners." },
  { icon: "📣", name: "Flyers & brochures", text: "DL to A3 flyers, tri-folds and booklets with quantity tiers." },
  { icon: "📓", name: "Notebooks", text: "Branded notebooks for corporate gifting and events." },
  { icon: "🪧", name: "Posters & roll-ups", text: "Large format, foam boards and banners." },
];

const FEATURES = [
  { title: "Paid before you print", text: "Stripe (cards, Apple Pay, Google Pay) and Mamo Pay go straight to your own account. No cash on delivery, so no unpaid jobs." },
  { title: "Pickup or scheduled delivery", text: "Customers choose a pickup branch or a delivery slot. Book couriers like Jeebly or Quiqup with one click, or use your own drivers." },
  { title: "AI business card designer", text: "Customers type their details and get print-ready layouts in seconds. Fewer revisions, more orders." },
  { title: "Instant, accurate quotes", text: "Your own pricing rules by paper size, colour, sides, stock and quantity tier. No more quoting on WhatsApp." },
  { title: "VAT-ready", text: "5% VAT on every order, your TRN on tax invoices, and reports ready for FTA filing." },
  { title: "Walk-in QR print queue", text: "Busy counter? Show a QR. Customers upload documents, pay on their phone and join a priority queue that prints automatically. Walk-ins are saved by phone number." },
  { title: "WhatsApp ordering with AI", soon: true, text: "Connect your existing WhatsApp Business number (coexistence: keep using the app too). Customers chat, AI quotes and sends a checkout link, and you can take over any time." },
  { title: "Your brand, your domain", text: "yourshop.quickprint.ae on day one. Connect print.yourshop.ae whenever you're ready." },
];

const FAQ = [
  { q: "Do I need a website already?", a: "No. You get a ready storefront on signup, with your products and prices loaded. You can change everything later." },
  { q: "How do I receive payments?", a: "Connect your own Stripe or Mamo Pay account. Customers pay you directly. We only bill our subscription and the small order fee." },
  { q: "Why no cash on delivery?", a: "COD means unpaid prints, failed deliveries and cash to reconcile. Every order on QuickPrint is prepaid. Card, Apple Pay and pay-by-link cover almost every customer." },
  { q: "Which delivery companies work with it?", a: "Your own drivers out of the box, with connectors for Jeebly, Quiqup, Careem Box and Aramex. Couriers need your own account with them." },
  { q: "Is it safe for confidential documents and ID photos?", a: "Confidential files are encrypted at rest, access is restricted and logged, and files are deleted automatically after the order is complete." },
  { q: "Can I cancel anytime?", a: "Yes. Monthly plans can be cancelled at any time. Your 14-day trial needs no card." },
];

export default async function Home() {
  const plans = await getPublicPlans();
  return (
    <div className="bg-white">
      <MarketingNav />
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_right,_#ffe4e6,_transparent_60%)]" />
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-16 md:grid-cols-2 md:py-24">
          <div>
            <span className="inline-block rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">Built for print shops in the UAE 🇦🇪</span>
            <h1 className="mt-5 text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">Take print orders online, <span className="text-brand-600">paid upfront</span>.</h1>
            <p className="mt-5 text-lg text-slate-600">Launch a branded print storefront in 5 minutes. Customers upload, see the price, pay by card or Apple Pay, and choose pickup or a delivery slot. You just print.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/signup" className="rounded-lg bg-brand-600 px-6 py-3 font-semibold text-white shadow-sm hover:bg-brand-700">Start 14-day free trial</Link>
              <Link href="/s/demo" className="rounded-lg border border-slate-300 px-6 py-3 font-semibold hover:bg-slate-50">See the demo store →</Link>
            </div>
            <p className="mt-4 text-sm text-slate-500">No card needed · Arabic & English customers · Cancel anytime</p>
          </div>
          <div className="relative">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
              <div className="flex items-center justify-between border-b pb-3"><p className="font-semibold">New order #DEM-1042</p><span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-800">Paid · Apple Pay</span></div>
              <ul className="space-y-3 py-4 text-sm">
                <li className="flex justify-between"><span>Business cards · 500 · soft-touch, gold foil</span><span className="font-semibold">AED 270.00</span></li>
                <li className="flex justify-between"><span>Passport photos · UAE spec · 2 sets</span><span className="font-semibold">AED 50.00</span></li>
                <li className="flex justify-between"><span>Document · 42 pages A4 colour, spiral</span><span className="font-semibold">AED 61.50</span></li>
              </ul>
              <div className="rounded-lg bg-slate-50 p-3 text-sm">
                <div className="flex justify-between"><span className="text-slate-500">Delivery · Jeebly · Tue 14:00–16:00</span><span>AED 15.00</span></div>
                <div className="flex justify-between"><span className="text-slate-500">VAT 5%</span><span>AED 19.83</span></div>
                <div className="mt-1 flex justify-between font-bold"><span>Total</span><span>AED 416.33</span></div>
              </div>
            </div>
            <div className="absolute -bottom-5 -left-4 hidden rounded-xl bg-slate-900 px-4 py-3 text-sm text-white shadow-lg sm:block">✨ AI made 3 card designs in 6s</div>
          </div>
        </div>
      </section>

      <section id="products" className="bg-slate-50 py-16">
        <div className="mx-auto max-w-6xl px-5">
          <h2 className="text-center text-3xl font-bold tracking-tight">Everything your counter sells, online</h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-slate-600">Pre-loaded with UAE sizes and typical prices. Edit any product, option or tier.</p>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {PRODUCTS.map((p) => (
              <div key={p.name} className="rounded-xl border border-slate-200 bg-white p-5">
                <div className="text-2xl">{p.icon}</div>
                <h3 className="mt-3 font-semibold">{p.name}</h3>
                <p className="mt-1 text-sm text-slate-600">{p.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="features" className="py-16">
        <div className="mx-auto max-w-6xl px-5">
          <h2 className="text-center text-3xl font-bold tracking-tight">Run the whole shop from one dashboard</h2>
          <div className="mt-10 grid gap-8 md:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title}>
                <div className="mb-3 h-1 w-10 rounded bg-brand-600" />
                <h3 className="font-semibold">{f.title}{"soon" in f && f.soon && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 align-middle text-xs font-medium text-amber-800">Coming soon</span>}</h3>
                <p className="mt-2 text-sm text-slate-600">{f.text}</p>
              </div>
            ))}
          </div>
          <div className="mt-12 grid gap-4 rounded-2xl bg-slate-900 p-8 text-white sm:grid-cols-4">
            {[["1", "Customer uploads & configures"], ["2", "Pays online, no COD"], ["3", "You print, status updates sent"], ["4", "Pickup or courier delivers"]].map(([n, t]) => (
              <div key={n} className="flex items-center gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-600 font-bold">{n}</span><span className="text-sm">{t}</span></div>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="bg-slate-50 py-16">
        <div className="mx-auto max-w-6xl px-5">
          <h2 className="text-center text-3xl font-bold tracking-tight">Simple pricing in AED</h2>
          <p className="mx-auto mb-8 mt-3 max-w-xl text-center text-slate-600">A flat subscription plus a small fee on paid orders. Payment provider fees are charged by your provider.</p>
          {plans.length ? <PricingTable plans={plans} /> : <p className="text-center text-slate-500">Plans coming soon.</p>}
        </div>
      </section>

      <section id="faq" className="py-16">
        <div className="mx-auto max-w-3xl px-5">
          <h2 className="text-center text-3xl font-bold tracking-tight">Questions</h2>
          <div className="mt-8 divide-y divide-slate-200 rounded-xl border border-slate-200">
            {FAQ.map((f) => (
              <details key={f.q} className="group px-5 py-4">
                <summary className="cursor-pointer list-none font-semibold marker:hidden">{f.q}<span className="float-right text-slate-400 group-open:rotate-45">+</span></summary>
                <p className="mt-2 text-sm text-slate-600">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="px-5 pb-16">
        <div className="mx-auto max-w-6xl rounded-2xl bg-brand-600 px-8 py-12 text-center text-white">
          <h2 className="text-3xl font-bold">Get your shop online this week</h2>
          <p className="mt-2 text-brand-100">Set up in 5 minutes. We&apos;ll help you load your prices for free.</p>
          <Link href="/signup" className="mt-6 inline-block rounded-lg bg-white px-6 py-3 font-semibold text-brand-700 hover:bg-brand-50">Start your free trial</Link>
        </div>
      </section>
      <MarketingFooter />
    </div>
  );
}
