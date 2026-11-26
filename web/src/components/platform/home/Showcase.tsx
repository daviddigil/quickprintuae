import Link from "next/link";
import { Badge, ProofLabel, Sparkline, Tabs } from "@/components/ui";
import { getCopy } from "@/lib/i18n";
import type { Copy as DictCopy } from "@/lib/i18n/en";
import { hrefFor } from "@/lib/i18n";
import { Icon } from "./icons";

function Copy({ title, points, href, more }: { title: string; points: string[]; href: string; more: string }) {
  return (
    <div>
      <h3 className="font-display text-title font-semibold">{title}</h3>
      <ul className="mt-5 space-y-3 text-on-surface-variant">
        {points.map((p) => <li key={p} className="flex gap-3"><Icon name="check" className="mt-1 size-4 shrink-0 text-success" /><span className="measure">{p}</span></li>)}
      </ul>
      {href && <p className="mt-4"><Link href={href} className="inline-flex min-h-11 items-center font-semibold text-primary underline underline-offset-2">{more}</Link></p>}
    </div>
  );
}

/** Window chrome shared by the mock panels. Always labelled as example data. */
function Panel({ title, children, example }: { title: string; children: React.ReactNode; example: string }) {
  return (
    <div className="overflow-hidden rounded-shape-xl border border-outline-variant bg-surface-lowest shadow-elev-2">
      <div className="flex items-center justify-between gap-3 border-b border-outline-variant/70 bg-surface-low px-4 py-2.5">
        <p dir="auto" className="text-xs font-semibold text-on-surface-variant">{title}</p><ProofLabel>{example}</ProofLabel>
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </div>
  );
}

const chip = "inline-flex min-h-8 items-center rounded-full border px-3 text-xs font-medium";
const chipOn = `${chip} border-primary bg-primary-container text-on-primary-container`;
const chipOff = `${chip} border-outline-variant text-on-surface-variant`;

export function StorefrontPanel({ copy = getCopy("en") }: { copy?: DictCopy }) {
  const t = copy.home.showcase.store;
  return (
    <Panel title={t.title} example={copy.common.example}>
      <p className="font-semibold">{t.name}</p>
      <p className="text-xs text-on-surface-variant">{t.ready}</p>
      <div className="mt-4 space-y-3 text-xs">
        <div><p className="mb-1.5 text-on-surface-variant">{t.size}</p><div className="flex flex-wrap gap-2">{t.sizes.map((x, i) => <span key={x} className={i === 1 ? chipOn : chipOff}>{x}</span>)}</div></div>
        <div><p className="mb-1.5 text-on-surface-variant">{t.paper}</p><div className="flex flex-wrap gap-2">{t.papers.map((x, i) => <span key={x} className={i === 1 ? chipOn : chipOff}>{x}</span>)}</div></div>
        <div><p className="mb-1.5 text-on-surface-variant">{t.qty}</p><div className="flex flex-wrap gap-2">{["50", "100", "500", "1,000"].map((x) => <span key={x} className={x === "500" ? chipOn : chipOff}>{x}</span>)}</div></div>
      </div>
      <div className="mt-5 flex items-end justify-between gap-4 border-t border-dashed border-outline-variant pt-4">
        <div><p className="text-xs text-on-surface-variant">{t.yourPrice}</p><p dir="ltr" className="text-2xl font-bold tabular-nums text-start">AED 300.00</p><p className="text-xs text-on-surface-variant tabular-nums">{t.vat}</p></div>
        <span className="inline-flex min-h-11 items-center rounded-full bg-primary px-5 text-sm font-semibold text-on-primary">{t.add}</span>
      </div>
    </Panel>
  );
}

const QUEUE_TONES = ["blue", "yellow", "gray", "gray"] as const;
export function QueuePanel({ copy = getCopy("en") }: { copy?: DictCopy }) {
  const t = copy.home.showcase.queue;
  return (
    <Panel title={t.title} example={copy.common.example}>
      <div className="grid gap-5 sm:grid-cols-[1fr_auto]">
        <ul className="divide-y divide-outline-variant/60">
          {t.rows.map((r, i) => (
            <li key={r.t} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0"><p className="text-sm font-semibold"><span className="font-mono">{r.t}</span> {r.n}</p><p dir="auto" className="truncate text-xs text-on-surface-variant">{r.f}</p></div>
              <Badge tone={QUEUE_TONES[i]} dot>{r.s}</Badge>
            </li>
          ))}
        </ul>
        <div className="hidden w-32 shrink-0 text-center sm:block">
          <div aria-hidden dir="ltr" className="mx-auto grid size-24 grid-cols-7 gap-[2px] rounded-shape-sm border border-outline-variant bg-surface-lowest p-2">
            {Array.from({ length: 49 }, (_, i) => <i key={i} className={((i * 7 + (i % 5) * 3 + i * i) % 3 === 0 ? "bg-on-surface" : "bg-transparent") + " rounded-[1px]"} />)}
          </div>
          <p className="mt-2 text-xs text-on-surface-variant">{t.scan}</p>
        </div>
      </div>
    </Panel>
  );
}

export function ChatPanel({ copy = getCopy("en") }: { copy?: DictCopy }) {
  const t = copy.home.showcase.chat;
  return (
    <Panel title={t.title} example={copy.common.example}>
      <div className="space-y-3 text-sm">
        <p className="ms-auto w-fit max-w-[85%] rounded-2xl rounded-ee-md bg-success-container px-3.5 py-2.5 text-on-success-container">{t.customer}</p>
        <div className="max-w-[92%] rounded-2xl rounded-es-md bg-surface-container px-3.5 py-2.5">
          <p className="font-semibold">{t.cart}</p>
          <p className="mt-1 text-xs tabular-nums text-on-surface-variant">{t.l1}<br />{t.l2}</p>
          <p className="mt-2 text-xs tabular-nums">{t.vat} · <span className="font-semibold">{t.total}</span></p>
          <p className="mt-2 text-xs text-primary underline underline-offset-2">{t.checkout}</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs"><span className={chipOn}>{t.confirm}</span><span className={chipOff}>{t.person}</span></div>
      </div>
    </Panel>
  );
}

function AdminPanel({ copy }: { copy: DictCopy }) {
  const t = copy.home.showcase.admin;
  return (
    <Panel title={t.title} example={copy.common.example}>
      <div className="grid grid-cols-3 gap-3">
        {[[t.waiting, "2"], [t.printing, "1"], [t.printed, "14"]].map(([l, v]) => (
          <div key={l} className="rounded-shape-md bg-surface-low p-3"><p className="text-xs text-on-surface-variant">{l}</p><p className="text-xl font-bold tabular-nums">{v}</p></div>
        ))}
      </div>
      <div className="mt-4 rounded-shape-md bg-surface-low p-3">
        <div className="flex items-baseline justify-between gap-3"><p className="text-xs text-on-surface-variant">{t.revenue}</p><p dir="ltr" className="text-sm font-bold tabular-nums">AED 6,240</p></div>
        <div className="mt-2 h-20" dir="ltr"><Sparkline ariaLabel={t.spark} data={[8, 11, 9, 14, 13, 17, 12, 18, 21, 19, 24, 22, 27, 31]} /></div>
      </div>
      <ul className="mt-4 space-y-2 text-sm">
        <li className="flex items-center justify-between gap-3"><span>{t.o1}</span><Badge tone="purple" dot>{t.printing}</Badge></li>
        <li className="flex items-center justify-between gap-3"><span>{t.o2}</span><Badge tone="green" dot>{t.ready}</Badge></li>
      </ul>
    </Panel>
  );
}

/** Tabbed product tour. All four panels are in the HTML (inactive ones hidden), so the text is crawlable. */
export function Showcase({ copy = getCopy("en") }: { copy?: DictCopy }) {
  const sc = copy.home.showcase, h = (p: string) => hrefFor(copy.locale, p);
  const tab = (id: string, copyTab: { label: string; title: string; points: string[] }, href: string, panel: React.ReactNode) => ({
    id, label: copyTab.label, content: <div className="grid items-center gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:gap-14"><Copy title={copyTab.title} points={copyTab.points} href={href} more={sc.learnMore} />{panel}</div>,
  });
  return (
    <section id="solutions" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6 md:py-24">
      <div className="max-w-2xl">
        <h2 className="font-display text-headline font-bold">{sc.heading}</h2>
        <p className="measure mt-4 text-lg text-on-surface-variant">{sc.lead}</p>
      </div>
      <Tabs className="mt-10" ariaLabel={sc.tourAria} tabs={[
        tab("store", sc.tabs.store, h("/solutions/print-shops"), <StorefrontPanel copy={copy} />),
        tab("walkin", sc.tabs.walkin, h("/solutions/walk-in-queue"), <QueuePanel copy={copy} />),
        tab("whatsapp", sc.tabs.whatsapp, h("/solutions/whatsapp-ordering"), <ChatPanel copy={copy} />),
        tab("admin", sc.tabs.admin, "", <AdminPanel copy={copy} />),
      ]} />
    </section>
  );
}
