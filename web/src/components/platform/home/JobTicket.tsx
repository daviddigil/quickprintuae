import { Badge, CropMarks, ProofLabel } from "@/components/ui";

/** Illustrative order ticket for the hero. All figures are example data and labelled as such. */
export function JobTicket() {
  const items = [
    { name: "Business cards", spec: "500 pcs · 85 × 55 mm · soft-touch, gold foil", price: "270.00" },
    { name: "Passport photos", spec: "UAE 43 × 55 mm · 2 sets of 6", price: "50.00" },
    { name: "Document", spec: "42 pages · A4 colour · spiral bound", price: "62.50" },
  ];
  return (
    <CropMarks className="mx-auto w-full max-w-md">
      <div className="overflow-hidden rounded-shape-xl border border-outline-variant bg-surface-lowest shadow-elev-3">
        <div className="flex items-center justify-between gap-3 border-b border-dashed border-outline-variant px-5 py-4">
          <div>
            <p className="text-xs text-on-surface-variant">Order</p>
            <p className="font-mono text-base font-semibold tabular-nums">QP-10482</p>
          </div>
          <div className="flex items-center gap-2"><ProofLabel>Example</ProofLabel><Badge tone="blue" dot>Paid</Badge></div>
        </div>
        <ul className="divide-y divide-outline-variant/60 px-5">
          {items.map((i) => (
            <li key={i.name} className="flex items-start justify-between gap-4 py-3.5">
              <div className="min-w-0"><p className="text-sm font-semibold">{i.name}</p><p className="mt-0.5 text-xs text-on-surface-variant">{i.spec}</p></div>
              <p className="shrink-0 text-sm font-semibold tabular-nums">AED {i.price}</p>
            </li>
          ))}
        </ul>
        <dl className="space-y-1.5 border-t border-dashed border-outline-variant bg-surface-low px-5 py-4 text-sm tabular-nums">
          <div className="flex justify-between text-on-surface-variant"><dt>Delivery, Tue 14:00 to 16:00</dt><dd>AED 15.00</dd></div>
          <div className="flex justify-between text-on-surface-variant"><dt>VAT 5%</dt><dd>AED 19.88</dd></div>
          <div className="flex justify-between pt-1 text-base font-bold"><dt>Total</dt><dd>AED 417.38</dd></div>
        </dl>
        <div className="flex items-center gap-2 px-5 py-3.5 text-xs text-on-surface-variant">
          <span aria-hidden className="live-dot size-2 rounded-full bg-success text-success" />
          <span>Printing on Front counter PC</span>
          <span className="ms-auto font-mono">Paid, Printing, Ready</span>
        </div>
      </div>
    </CropMarks>
  );
}
