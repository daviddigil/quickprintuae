import { Badge, CropMarks, ProofLabel } from "@/components/ui";
import { getCopy } from "@/lib/i18n";
import type { Copy } from "@/lib/i18n/en";

/** Illustrative order ticket for the hero. All figures are example data and labelled as such. */
export function JobTicket({ copy = getCopy("en") }: { copy?: Copy }) {
  const t = copy.home.ticket;
  return (
    <CropMarks className="mx-auto w-full max-w-md">
      <div className="overflow-hidden rounded-shape-xl border border-outline-variant bg-surface-lowest shadow-elev-3">
        <div className="flex items-center justify-between gap-3 border-b border-dashed border-outline-variant px-5 py-4">
          <div>
            <p className="text-xs text-on-surface-variant">{t.order}</p>
            <p dir="ltr" className="font-mono text-base font-semibold tabular-nums">QP-10482</p>
          </div>
          <div className="flex items-center gap-2"><ProofLabel>{copy.common.example}</ProofLabel><Badge tone="blue" dot>{t.paid}</Badge></div>
        </div>
        <ul className="divide-y divide-outline-variant/60 px-5">
          {t.items.map((i) => (
            <li key={i.name} className="flex items-start justify-between gap-4 py-3.5">
              <div className="min-w-0"><p className="text-sm font-semibold">{i.name}</p><p className="mt-0.5 text-xs text-on-surface-variant">{i.spec}</p></div>
              <p dir="ltr" className="shrink-0 text-sm font-semibold tabular-nums">AED {i.price}</p>
            </li>
          ))}
        </ul>
        <dl className="space-y-1.5 border-t border-dashed border-outline-variant bg-surface-low px-5 py-4 text-sm tabular-nums">
          <div className="flex justify-between text-on-surface-variant"><dt>{t.delivery}</dt><dd dir="ltr">AED 15.00</dd></div>
          <div className="flex justify-between text-on-surface-variant"><dt>{t.vat}</dt><dd dir="ltr">AED 19.88</dd></div>
          <div className="flex justify-between pt-1 text-base font-bold"><dt>{t.total}</dt><dd dir="ltr">AED 417.38</dd></div>
        </dl>
        <div className="flex items-center gap-2 px-5 py-3.5 text-xs text-on-surface-variant">
          <span aria-hidden className="live-dot size-2 rounded-full bg-success text-success" />
          <span>{t.printingOn}</span>
          <span className="ms-auto font-mono">{t.flow}</span>
        </div>
      </div>
    </CropMarks>
  );
}
