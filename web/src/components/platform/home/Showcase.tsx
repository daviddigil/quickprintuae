import { Badge, ProofLabel, Sparkline, Tabs } from "@/components/ui";
import { Icon } from "./icons";

function Copy({ title, points }: { title: string; points: string[] }) {
  return (
    <div>
      <h3 className="font-display text-title font-semibold">{title}</h3>
      <ul className="mt-5 space-y-3 text-on-surface-variant">
        {points.map((p) => <li key={p} className="flex gap-3"><Icon name="check" className="mt-1 size-4 shrink-0 text-success" /><span className="measure">{p}</span></li>)}
      </ul>
    </div>
  );
}

/** Window chrome shared by the mock panels. Always labelled as example data. */
function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-shape-xl border border-outline-variant bg-surface-lowest shadow-elev-2">
      <div className="flex items-center justify-between gap-3 border-b border-outline-variant/70 bg-surface-low px-4 py-2.5">
        <p className="text-xs font-semibold text-on-surface-variant">{title}</p><ProofLabel>Example</ProofLabel>
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </div>
  );
}

const chip = "inline-flex min-h-8 items-center rounded-full border px-3 text-xs font-medium";
const chipOn = `${chip} border-primary bg-primary-container text-on-primary-container`;
const chipOff = `${chip} border-outline-variant text-on-surface-variant`;

function StorefrontPanel() {
  return (
    <Panel title="yourshop.quickprint.ae / flyers">
      <p className="font-semibold">Flyers and leaflets</p>
      <p className="text-xs text-on-surface-variant">Ready in about 2 days</p>
      <div className="mt-4 space-y-3 text-xs">
        <div><p className="mb-1.5 text-on-surface-variant">Size</p><div className="flex flex-wrap gap-2"><span className={chipOff}>A6 105 × 148 mm</span><span className={chipOn}>A5 148 × 210 mm</span><span className={chipOff}>A4 210 × 297 mm</span></div></div>
        <div><p className="mb-1.5 text-on-surface-variant">Paper</p><div className="flex flex-wrap gap-2"><span className={chipOff}>130 gsm gloss</span><span className={chipOn}>150 gsm gloss</span><span className={chipOff}>170 gsm matte</span></div></div>
        <div><p className="mb-1.5 text-on-surface-variant">Quantity</p><div className="flex flex-wrap gap-2"><span className={chipOff}>50</span><span className={chipOff}>100</span><span className={chipOn}>500</span><span className={chipOff}>1,000</span></div></div>
      </div>
      <div className="mt-5 flex items-end justify-between gap-4 border-t border-dashed border-outline-variant pt-4">
        <div><p className="text-xs text-on-surface-variant">Your price</p><p className="text-2xl font-bold tabular-nums">AED 300.00</p><p className="text-xs text-on-surface-variant tabular-nums">plus AED 15.00 VAT (5%)</p></div>
        <span className="inline-flex min-h-11 items-center rounded-full bg-primary px-5 text-sm font-semibold text-on-primary">Add to cart</span>
      </div>
    </Panel>
  );
}

function QueuePanel() {
  const rows = [
    { t: "W-014", n: "Aisha", f: "report.pdf · 12 pp", s: "Printing now", tone: "blue" as const },
    { t: "W-016", n: "Omar", f: "form.pdf · 1 p", s: "High, next", tone: "yellow" as const },
    { t: "W-015", n: "Sara", f: "thesis.pdf · 148 pp", s: "Waiting", tone: "gray" as const },
    { t: "W-017", n: "Khalid", f: "id-copy.jpg · 1 p", s: "Awaiting payment", tone: "gray" as const },
  ];
  return (
    <Panel title="Walk-in queue">
      <div className="grid gap-5 sm:grid-cols-[1fr_auto]">
        <ul className="divide-y divide-outline-variant/60">
          {rows.map((r) => (
            <li key={r.t} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0"><p className="text-sm font-semibold"><span className="font-mono">{r.t}</span> {r.n}</p><p className="truncate text-xs text-on-surface-variant">{r.f}</p></div>
              <Badge tone={r.tone} dot>{r.s}</Badge>
            </li>
          ))}
        </ul>
        <div className="hidden w-32 shrink-0 text-center sm:block">
          <div aria-hidden className="mx-auto grid size-24 grid-cols-7 gap-[2px] rounded-shape-sm border border-outline-variant bg-surface-lowest p-2">
            {Array.from({ length: 49 }, (_, i) => <i key={i} className={((i * 7 + (i % 5) * 3 + i * i) % 3 === 0 ? "bg-on-surface" : "bg-transparent") + " rounded-[1px]"} />)}
          </div>
          <p className="mt-2 text-xs text-on-surface-variant">Scan to print</p>
        </div>
      </div>
    </Panel>
  );
}

function ChatPanel() {
  return (
    <Panel title="WhatsApp · +971 50 123 4567">
      <div className="space-y-3 text-sm">
        <p className="ms-auto w-fit max-w-[85%] rounded-2xl rounded-ee-md bg-success-container px-3.5 py-2.5 text-on-success-container">500 business cards and 100 flyers</p>
        <div className="max-w-[92%] rounded-2xl rounded-es-md bg-surface-container px-3.5 py-2.5">
          <p className="font-semibold">Your cart</p>
          <p className="mt-1 text-xs tabular-nums text-on-surface-variant">1. 500 business cards, 350 gsm: AED 120.00<br />2. 100 flyers, A5 150 gsm: AED 120.00</p>
          <p className="mt-2 text-xs tabular-nums">VAT 5%: AED 12.00 · <span className="font-semibold">Total AED 252.00</span></p>
          <p className="mt-2 text-xs text-primary underline underline-offset-2">Open checkout to upload files and pay</p>
        </div>
        <div className="flex gap-2 text-xs"><span className={chipOn}>Confirm cart</span><span className={chipOff}>Talk to a person</span></div>
      </div>
    </Panel>
  );
}

function AdminPanel() {
  return (
    <Panel title="Dashboard · today">
      <div className="grid grid-cols-3 gap-3">
        {[["Waiting", "2"], ["Printing", "1"], ["Printed", "14"]].map(([l, v]) => (
          <div key={l} className="rounded-shape-md bg-surface-low p-3"><p className="text-xs text-on-surface-variant">{l}</p><p className="text-xl font-bold tabular-nums">{v}</p></div>
        ))}
      </div>
      <div className="mt-4 rounded-shape-md bg-surface-low p-3">
        <div className="flex items-baseline justify-between"><p className="text-xs text-on-surface-variant">Paid orders, last 14 days</p><p className="text-sm font-bold tabular-nums">AED 6,240</p></div>
        <div className="mt-2 h-20"><Sparkline ariaLabel="Paid orders rose over the last 14 days" data={[8, 11, 9, 14, 13, 17, 12, 18, 21, 19, 24, 22, 27, 31]} /></div>
      </div>
      <ul className="mt-4 space-y-2 text-sm">
        <li className="flex items-center justify-between"><span>QP-10482 · Business cards</span><Badge tone="purple" dot>Printing</Badge></li>
        <li className="flex items-center justify-between"><span>QP-10481 · Photo prints</span><Badge tone="green" dot>Ready</Badge></li>
      </ul>
    </Panel>
  );
}

/** Tabbed product tour. All four panels are in the HTML (inactive ones hidden), so the text is crawlable. */
export function Showcase() {
  const tab = (id: string, label: string, copy: { title: string; points: string[] }, panel: React.ReactNode) => ({
    id, label, content: <div className="grid items-center gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:gap-14"><Copy {...copy} />{panel}</div>,
  });
  return (
    <section id="solutions" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6 md:py-24">
      <div className="max-w-2xl">
        <h2 className="font-display text-headline font-bold">See how an order moves through your shop</h2>
        <p className="measure mt-4 text-lg text-on-surface-variant">The same system covers your online store, your counter and your WhatsApp inbox.</p>
      </div>
      <Tabs className="mt-10" ariaLabel="Product tour" tabs={[
        tab("store", "Storefront", { title: "Customers see the price before they pay", points: ["They pick size, paper and quantity. The price updates as they choose.", "They upload files, and page counts are read from the PDF.", "They pay online, then choose pickup or a delivery slot."] }, <StorefrontPanel />),
        tab("walkin", "Walk-in queue", { title: "Clear the counter queue", points: ["Show a QR code at the counter.", "Customers upload documents and pay on their phone.", "Paid jobs reach your printer in priority order, shortest first."] }, <QueuePanel />),
        tab("whatsapp", "WhatsApp AI", { title: "Answer WhatsApp orders at any hour", points: ["Connect the number you already use. You keep the WhatsApp Business app.", "The AI quotes with your own prices and builds a cart.", "Reply from your phone and the AI steps aside."] }, <ChatPanel />),
        tab("admin", "Admin", { title: "See the whole shop at a glance", points: ["Orders, print queue and revenue sit on one screen.", "Move jobs from paid to printing to ready.", "Download a tax invoice with your TRN in one click."] }, <AdminPanel />),
      ]} />
    </section>
  );
}
