import { RegMark } from "@/components/ui";

const STEPS = [
  { n: "1", title: "Sign up and check your prices", text: "Your storefront opens with UAE sizes and typical prices already in place. Change any of them in the dashboard." },
  { n: "2", title: "Share your store link", text: "Send it on WhatsApp, add it to Instagram, or print the QR code for your counter." },
  { n: "3", title: "Print and hand over", text: "Paid orders appear in your queue. Mark them ready and your customers get the update." },
];

export function HowItWorks() {
  return (
    <section aria-labelledby="how" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-24">
      <div className="flex items-center gap-3"><RegMark /><h2 id="how" className="font-display text-headline font-bold">Live in three steps</h2></div>
      <ol className="mt-10 grid gap-px overflow-hidden rounded-shape-xl border border-outline-variant bg-outline-variant md:grid-cols-3">
        {STEPS.map((s) => (
          <li key={s.n} className="bg-surface-lowest p-6 sm:p-8">
            <p className="font-mono text-sm font-semibold text-primary">Step {s.n}</p>
            <h3 className="mt-3 font-display text-title font-semibold">{s.title}</h3>
            <p className="measure mt-2 text-on-surface-variant">{s.text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
