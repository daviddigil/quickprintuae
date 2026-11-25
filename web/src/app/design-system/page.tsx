import type { Metadata } from "next";
import { Alert, Badge, Button, Card, CardHeader, CropMarks, Field, FloatingInput, InkBar, Input, Meter, ProofLabel, RegMark, Select, Sparkline, Stat, Table, Textarea } from "@/components/ui";
import { DemoInteractive } from "./demo-interactive";
import { SpotlightCard } from "@/components/fx/SpotlightCard";
import { CountUp } from "@/components/fx/CountUp";
import { Reveal } from "@/components/fx/Reveal";
import { SpecTicker } from "@/components/fx/SpecTicker";
import { Logo } from "@/components/platform/Logo";

export const metadata: Metadata = { title: "Design system", robots: { index: false, follow: false } };

const SWATCHES = ["primary", "primary-container", "secondary", "secondary-container", "tertiary", "tertiary-container", "success", "warning", "critical", "info", "surface", "surface-low", "surface-container", "surface-high", "inverse-surface", "outline", "outline-variant"];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="border-t border-outline-variant py-10"><h2 className="mb-6 font-display text-title font-semibold">{title}</h2>{children}</section>;
}

export default function DesignSystemPage() {
  return (
    <div className="theme-auto min-h-screen">
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <Logo />
        <h1 className="mt-6 font-display text-display font-bold">Design system</h1>
        <p className="measure mt-3 text-on-surface-variant">Internal reference for QA. Every primitive and motion component, in the current theme. Toggle your OS dark mode to check both palettes. Not indexed.</p>

        <Section title="Colour roles">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {SWATCHES.map((n) => (
              <div key={n} className="overflow-hidden rounded-shape-md border border-outline-variant">
                <div className="h-12" style={{ background: `var(--color-${n})` }} />
                <p className="px-2 py-1.5 font-mono text-[11px]">{n}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-4"><InkBar size={10} /><span className="text-sm text-on-surface-variant">Process inks: cyan, magenta, yellow, key. Category cues only.</span></div>
        </Section>

        <Section title="Type">
          <p className="font-display text-display font-bold">Display 72</p>
          <p className="font-display text-headline font-bold">Headline 46</p>
          <p className="font-display text-title font-semibold">Title 24</p>
          <p className="measure mt-2 text-base">Body text keeps to about 65 characters a line so it stays easy to read. Figures line up: <span className="tabular-nums">AED 1,234.50 and AED 9,876.00</span>.</p>
        </Section>

        <Section title="Buttons">
          <div className="flex flex-wrap items-center gap-3">
            <Button>Filled</Button><Button variant="tonal">Tonal</Button><Button variant="outlined">Outlined</Button><Button variant="text">Text</Button>
            <Button variant="dark">Dark</Button><Button variant="danger">Delete</Button><Button disabled>Disabled</Button>
            <Button pill size="lg">Pill large</Button><Button size="sm">Small</Button>
          </div>
        </Section>

        <Section title="Form controls">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Shop name"><Input placeholder="Al Noor Printing" /></Field>
            <Field label="Emirate"><Select defaultValue="Dubai"><option>Dubai</option><option>Abu Dhabi</option></Select></Field>
            <FloatingInput label="Floating label" />
            <FloatingInput label="With error" error="Enter a valid email address." defaultValue="aisha@" />
            <div className="sm:col-span-2"><Field label="Notes"><Textarea rows={3} /></Field></div>
          </div>
          <div className="mt-6"><DemoInteractive /></div>
        </Section>

        <Section title="Status">
          <div className="flex flex-wrap items-center gap-2"><Badge tone="green" dot>Ready</Badge><Badge tone="blue" dot>Paid</Badge><Badge tone="purple" dot>Printing</Badge><Badge tone="yellow" dot>Waiting</Badge><Badge tone="red" dot>Cancelled</Badge><Badge>Draft</Badge><Badge tone="cyan">Cyan</Badge><Badge tone="magenta">Magenta</Badge><Badge tone="yellowink">Yellow</Badge></div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2"><Alert tone="red">Payment failed. Check the card number and try again.</Alert><Alert tone="green">Order marked as ready.</Alert><Alert tone="yellow">Your trial ends in 3 days.</Alert><Alert tone="blue">New WhatsApp rates start on 1 January.</Alert></div>
        </Section>

        <Section title="Dashboard">
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat label="Paid today" value="AED 2,340" tone="success" trend={<span className="text-success">+12%</span>} sub="vs yesterday" spark={<Sparkline ariaLabel="Paid today is trending up" data={[3, 5, 4, 7, 6, 9, 12]} />} />
            <Stat label="Waiting to print" value="7" tone="warning" sub="oldest 18 min" />
            <Stat label="Failed payments" value="2" tone="critical" sub="needs follow-up" />
          </div>
          <Card className="mt-4"><CardHeader title="Recent orders" subtitle="Last 3" />
            <Table head={["Order", "Customer", "Status", "Total"]}>
              {[["QP-10482", "Aisha", "Paid", "AED 417.38"], ["QP-10481", "Omar", "Ready", "AED 96.00"], ["QP-10480", "Sara", "Printing", "AED 210.50"]].map((r) => (
                <tr key={r[0]}><td className="px-4 py-3 font-mono">{r[0]}</td><td className="px-4 py-3">{r[1]}</td><td className="px-4 py-3"><Badge tone={r[2] === "Ready" ? "green" : r[2] === "Paid" ? "blue" : "purple"} dot>{r[2]}</Badge></td><td className="px-4 py-3">{r[3]}</td></tr>
              ))}
            </Table>
          </Card>
          <div className="mt-4 max-w-sm space-y-3"><Meter label="Orders this month" value={240} max={300} /><Meter label="Staff seats" value={2} max={2} /></div>
        </Section>

        <Section title="Print motifs">
          <div className="flex flex-wrap items-center gap-10 p-4">
            <CropMarks><div className="grid size-28 place-items-center rounded-shape-sm bg-surface-container text-sm">Crop marks</div></CropMarks>
            <div className="halftone halftone-fade grid size-28 place-items-center rounded-shape-sm border border-outline-variant text-sm">Halftone</div>
            <ProofLabel>A4 · 80 gsm</ProofLabel><RegMark />
          </div>
        </Section>

        <Section title="Motion components">
          <div className="grid gap-4 sm:grid-cols-3">
            <SpotlightCard className="rounded-shape-xl border border-outline-variant bg-surface-lowest p-6"><p className="font-semibold">SpotlightCard</p><p className="mt-1 text-sm text-on-surface-variant">Move a mouse over this card.</p></SpotlightCard>
            <div className="rounded-shape-xl border border-outline-variant p-6"><p className="text-sm text-on-surface-variant">CountUp</p><p className="text-4xl font-bold"><CountUp value={1280} prefix="AED " /></p></div>
            <Reveal className="rounded-shape-xl border border-outline-variant p-6"><p className="font-semibold">Reveal</p><p className="mt-1 text-sm text-on-surface-variant">Rises once when scrolled into view.</p></Reveal>
          </div>
          <SpecTicker className="mt-6 rounded-shape-lg bg-inverse-surface py-4 text-inverse-on-surface" items={["A5 · A4 · A3", "80 · 150 · 350 gsm", "AED · 5% VAT"]} />
        </Section>
      </main>
    </div>
  );
}
