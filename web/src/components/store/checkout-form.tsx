"use client";
import { useMemo, useState } from "react";
import { CreditCard, Loader2, MapPin, Store, Truck } from "lucide-react";
import { Alert, Button, Field, Input, LinkButton, Select, Textarea, cn } from "@/components/ui";
import { clearCart, useCart } from "@/lib/cart";
import { computeOrderTotals, formatAED } from "@/lib/pricing";
import { generateSlots } from "@/lib/slots";
import { EMIRATES, type DeliverySettings } from "@/lib/types";

export interface CheckoutData {
  store: string;
  vatRate: number;
  pricesIncludeVat: boolean;
  delivery: DeliverySettings;
  providers: ("stripe" | "mamo")[];
  turnaround: Record<string, number>;
  pickupLocations: { id: string; name: string; address: string; emirate: string; hours: string }[];
  zones: { emirate: string; fee: number; freeAbove: number | null; minLeadHours: number }[];
  prefill?: { name: string; email: string; phone: string };
  defaultEmirate: string;
}

const PROVIDER_LABEL = { stripe: { t: "Card / Apple Pay / Google Pay", s: "Secured by Stripe" }, mamo: { t: "Mamo Pay", s: "Cards, Apple Pay & Google Pay via Mamo" } };

export function CheckoutForm(d: CheckoutData) {
  const { lines, estimate } = useCart(d.store);
  const canDeliver = d.delivery.enabled && d.zones.length > 0;
  const canPickup = d.delivery.pickupEnabled && d.pickupLocations.length > 0;
  const [mode, setMode] = useState<"pickup" | "delivery">(canPickup ? "pickup" : "delivery");
  const [contact, setContact] = useState(d.prefill ?? { name: "", email: "", phone: "" });
  const [addr, setAddr] = useState({ line1: "", line2: "", area: "", city: "", emirate: d.zones.some((z) => z.emirate === d.defaultEmirate) ? d.defaultEmirate : d.zones[0]?.emirate ?? "Dubai", notes: "" });
  const [pickupId, setPickupId] = useState(d.pickupLocations[0]?.id ?? "");
  const [slot, setSlot] = useState<string>("");
  const [day, setDay] = useState<string>("");
  const [provider, setProvider] = useState(d.providers[0]);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ msg: string; orderUrl?: string } | null>(null);

  const zone = d.zones.find((z) => z.emirate === addr.emirate);
  const turnaround = Math.max(0, ...lines.map((l) => d.turnaround[l.productId] ?? 24));
  const lead = mode === "delivery" ? Math.max(turnaround, zone?.minLeadHours ?? 24) : turnaround;
  const days = useMemo(() => generateSlots(d.delivery, lead), [d.delivery, lead]);
  const activeDay = days.find((x) => x.date === day) ?? days[0];
  const deliveryFee = mode === "delivery" && zone ? (zone.freeAbove != null && estimate >= zone.freeAbove ? 0 : zone.fee) : 0;
  const totals = computeOrderTotals(lines.map((l) => l.estimate), deliveryFee, d.vatRate, d.pricesIncludeVat);
  const slotValid = !!activeDay?.slots.some((s) => s.start === slot);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!slotValid) return setError({ msg: `Please choose a ${mode} time slot.` });
    if (!provider) return setError({ msg: "Online payment is not available for this shop yet." });
    setBusy(true);
    const res = await fetch(`/api/v1/store/${d.store}/checkout`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contact, fulfillment: mode, provider, slotStart: slot, notes: notes || undefined,
        pickupLocationId: mode === "pickup" ? pickupId : undefined,
        address: mode === "delivery" ? { ...addr, line2: addr.line2 || undefined, notes: addr.notes || undefined } : undefined,
        lines: lines.map((l) => ({ productId: l.productId, quantity: l.quantity, pages: l.pages, selections: l.selections, fileIds: l.fileIds, design: l.design })),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.url) {
      clearCart(d.store);
      window.location.href = data.url;
      return;
    }
    setBusy(false);
    if (data.orderId) clearCart(d.store); // order exists; payment can be retried from the order page
    setError({ msg: data.error ?? "Something went wrong. Please try again.", orderUrl: data.orderUrl });
  }

  if (!lines.length && !error) {
    return <div className="rounded-xl border p-8 text-center"><p className="font-medium">Your cart is empty.</p><LinkButton href={`/s/${d.store}`} variant="store" className="mt-4">Browse products</LinkButton></div>;
  }

  const set = <T extends object>(s: T, f: (v: T) => void) => (k: keyof T) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => f({ ...s, [k]: e.target.value });
  const c = set(contact, setContact);
  const a = set(addr, setAddr);

  return (
    <form onSubmit={submit} className="grid gap-8 lg:grid-cols-[1fr_340px]">
      <div className="min-w-0 space-y-8">
        <section>
          <h2 className="mb-3 text-lg font-semibold">Contact details</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Full name"><Input name="name" required value={contact.name} onChange={c("name")} autoComplete="name" /></Field>
            <Field label="Email"><Input name="email" type="email" required value={contact.email} onChange={c("email")} autoComplete="email" /></Field>
            <Field label="Mobile"><Input name="phone" type="tel" required placeholder="+971 5x xxx xxxx" value={contact.phone} onChange={c("phone")} autoComplete="tel" /></Field>
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold">How would you like to receive it?</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {canPickup && <ModeCard active={mode === "pickup"} onClick={() => { setMode("pickup"); setSlot(""); }} icon={<Store className="h-5 w-5" />} title="Pick up" sub="Free · collect at a branch" testid="mode-pickup" />}
            {canDeliver && <ModeCard active={mode === "delivery"} onClick={() => { setMode("delivery"); setSlot(""); }} icon={<Truck className="h-5 w-5" />} title="Scheduled delivery" sub="Choose a time slot, UAE-wide" testid="mode-delivery" />}
          </div>

          {mode === "pickup" ? (
            <div className="mt-4 space-y-2">
              {d.pickupLocations.map((l) => (
                <label key={l.id} className={cn("flex cursor-pointer gap-3 rounded-lg border p-3 text-sm", pickupId === l.id ? "border-store bg-store-soft" : "border-outline-variant")}>
                  <input type="radio" name="pickup" checked={pickupId === l.id} onChange={() => setPickupId(l.id)} className="mt-1" />
                  <MapPin className="text-store mt-0.5 h-4 w-4 shrink-0" />
                  <span><span className="font-medium">{l.name}</span><span className="block text-on-surface-variant">{l.address}, {l.emirate}</span><span className="block text-xs text-on-surface-variant">{l.hours}</span></span>
                </label>
              ))}
            </div>
          ) : (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Emirate">
                <Select name="emirate" value={addr.emirate} onChange={(e) => { a("emirate")(e); setSlot(""); }}>
                  {EMIRATES.filter((e) => d.zones.some((z) => z.emirate === e)).map((e) => <option key={e}>{e}</option>)}
                </Select>
              </Field>
              <Field label="Area / community"><Input name="area" required value={addr.area} onChange={a("area")} placeholder="e.g. Business Bay" /></Field>
              <Field label="Building / street"><Input name="line1" required value={addr.line1} onChange={a("line1")} placeholder="Building name, street" /></Field>
              <Field label="Flat / office (optional)"><Input name="line2" value={addr.line2} onChange={a("line2")} /></Field>
              <Field label="City"><Input name="city" required value={addr.city} onChange={a("city")} placeholder={addr.emirate} /></Field>
              <Field label="Directions for driver (optional)"><Input name="addrnotes" value={addr.notes} onChange={a("notes")} placeholder="Landmark, Makani no." /></Field>
              {zone && <p className="text-sm text-on-surface-variant sm:col-span-2">Delivery to {zone.emirate}: {formatAED(zone.fee)}{zone.freeAbove != null ? ` · free over ${formatAED(zone.freeAbove)}` : ""}</p>}
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-1 text-lg font-semibold">{mode === "pickup" ? "Pickup time" : "Delivery slot"}</h2>
          <p className="mb-3 text-sm text-on-surface-variant">Earliest slot reflects production time ({turnaround < 24 ? `${turnaround}h` : `${Math.round(turnaround / 24)} day(s)`}){mode === "delivery" ? " and delivery lead time" : ""}. UAE time.</p>
          {days.length === 0 ? <Alert tone="yellow">No slots available right now. Please contact the shop.</Alert> : (
            <>
              <div className="flex gap-2 overflow-x-auto pb-2">
                {days.map((x) => (
                  <button type="button" key={x.date} onClick={() => { setDay(x.date); setSlot(""); }}
                    className={cn("shrink-0 rounded-lg border px-3 py-2 text-sm font-medium", activeDay?.date === x.date ? "border-store bg-store-soft text-store" : "border-outline-variant hover:bg-surface-low")}>{x.label}</button>
                ))}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="slots">
                {activeDay?.slots.map((s) => (
                  <button type="button" key={s.start} onClick={() => setSlot(s.start)}
                    className={cn("rounded-lg border px-2 py-2 text-xs font-medium sm:text-sm", slot === s.start ? "btn-store border-transparent" : "border-outline-variant hover:bg-surface-low")}>{s.label}</button>
                ))}
              </div>
            </>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold">Payment</h2>
          {d.providers.length === 0 ? (
            <Alert tone="yellow">This shop hasn&apos;t set up online payments yet, so orders can&apos;t be placed online. Please contact the shop directly.</Alert>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {d.providers.map((p) => (
                <label key={p} className={cn("flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm", provider === p ? "border-store bg-store-soft" : "border-outline-variant")}>
                  <input type="radio" name="provider" checked={provider === p} onChange={() => setProvider(p)} />
                  <CreditCard className="h-5 w-5 text-on-surface-variant" />
                  <span><span className="font-medium">{PROVIDER_LABEL[p].t}</span><span className="block text-xs text-on-surface-variant">{PROVIDER_LABEL[p].s}</span></span>
                </label>
              ))}
            </div>
          )}
          <p className="mt-2 text-xs text-on-surface-variant">Online payment only — cash on delivery is not available.</p>
        </section>

        <Field label="Order notes (optional)"><Textarea name="notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      </div>

      <aside className="h-fit rounded-xl border border-outline-variant bg-white p-5 lg:sticky lg:top-32">
        <h2 className="font-semibold">Order summary</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {lines.map((l) => (
            <li key={l.key} className="flex justify-between gap-2">
              <span className="min-w-0 text-on-surface-variant">{l.productName} × {l.quantity}{l.pages > 1 ? ` (${l.pages}p)` : ""}
                {l.details?.map((d) => <span key={d} className="block break-words text-xs">{d}</span>)}
                {!l.design && l.fileNames.length > 0 && <span className="block truncate text-xs">{l.kind === "merchandise" || l.kind === "gift_pack" ? "Artwork: " : ""}{l.fileNames.join(", ")}</span>}
              </span>
              <span>{formatAED(l.estimate)}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-4 space-y-1 border-t border-outline-variant pt-3 text-sm">
          <Row k="Subtotal" v={formatAED(totals.subtotal)} />
          <Row k={mode === "delivery" ? "Delivery" : "Pickup"} v={totals.deliveryFee ? formatAED(totals.deliveryFee) : "Free"} />
          <Row k={`VAT ${d.vatRate}%${d.pricesIncludeVat ? " (incl.)" : ""}`} v={formatAED(totals.vat)} />
          <div className="flex justify-between pt-2 text-base font-bold"><dt>Total</dt><dd data-testid="total">{formatAED(totals.total)}</dd></div>
        </dl>
        {error && <div className="mt-4"><Alert>{error.msg}{error.orderUrl && <> <a className="font-semibold underline" href={error.orderUrl}>View order</a></>}</Alert></div>}
        <Button variant="store" className="mt-5 w-full py-3" disabled={busy || !d.providers.length || !lines.length} data-testid="place-order">
          {busy ? <><Loader2 className="h-4 w-4 animate-spin" />Processing…</> : `Pay ${formatAED(totals.total)}`}
        </Button>
        <p className="mt-2 text-center text-xs text-on-surface-variant">Final price is confirmed by the server before payment.</p>
      </aside>
    </form>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between"><dt className="text-on-surface-variant">{k}</dt><dd>{v}</dd></div>;
}

function ModeCard({ active, onClick, icon, title, sub, testid }: { active: boolean; onClick: () => void; icon: React.ReactNode; title: string; sub: string; testid: string }) {
  return (
    <button type="button" onClick={onClick} data-testid={testid} className={cn("flex items-center gap-3 rounded-lg border p-4 text-left", active ? "border-store bg-store-soft" : "border-outline-variant hover:bg-surface-low")}>
      <span className={cn("rounded-lg p-2", active ? "btn-store" : "bg-surface-container")}>{icon}</span>
      <span><span className="block font-semibold">{title}</span><span className="text-sm text-on-surface-variant">{sub}</span></span>
    </button>
  );
}
