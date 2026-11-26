"use client";
import { useMemo, useRef, useState } from "react";
import { CreditCard, FileText, Loader2, Minus, Plus, Upload, X } from "lucide-react";
import { Alert, Button, Card, Field, Input, Select, cn } from "@/components/ui";
import { computeLinePrice, computeOrderTotals, formatAED } from "@/lib/pricing";
import type { OptionGroup, ProductConfig } from "@/lib/types";

const ACCEPT = ".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.jpg,.jpeg,.png";

interface Item {
  id: string; filename: string; pageCount: number | null; pages: number;
  copies: number; color: string; sides: string; paperSize: string;
}

export function WalkInFlow({ store, shopName, config, maxFiles, vatRate, pricesIncludeVat, providers }: {
  store: string; shopName: string; config: ProductConfig; maxFiles: number; vatRate: number; pricesIncludeVat: boolean; providers: "stripe"[];
}) {
  const group = (key: string): OptionGroup | undefined => config.optionGroups.find((g) => g.key === key);
  const paper = group("paper_size"), colour = group("color"), sides = group("sides");
  const def = (g: OptionGroup | undefined, fb: string) => g?.default ?? g?.choices[0]?.value ?? fb;

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [welcome, setWelcome] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const provider = providers[0];
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  /* ---------- step 1 ---------- */
  async function start(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setBusy(true);
    const res = await fetch(`/api/v1/store/${store}/walk-in/identify`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ phone }) });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(j.error ?? "Please check your number.");
    setPhone(j.phone);
    if (j.firstName) { setWelcome(j.firstName); if (!name.trim()) setName(j.firstName); }
    setStep(2);
  }

  /* ---------- step 2 ---------- */
  async function upload(list: FileList | File[]) {
    setError(null);
    const room = maxFiles - items.length - uploading;
    const arr = Array.from(list).slice(0, Math.max(0, room));
    if (Array.from(list).length > arr.length) setError(`You can print up to ${maxFiles} files per visit.`);
    setUploading((n) => n + arr.length);
    const done: Item[] = [];
    await Promise.all(arr.map(async (file) => {
      try {
        const fd = new FormData(); fd.append("file", file); fd.append("phone", phone);
        const res = await fetch(`/api/v1/store/${store}/walk-in/uploads`, { method: "POST", body: fd });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j.error ?? `Upload failed (${res.status})`);
        done.push({ id: j.id, filename: j.filename, pageCount: j.pageCount, pages: j.pageCount ?? 1, copies: 1, color: def(colour, "bw"), sides: def(sides, "single"), paperSize: def(paper, "A4") });
      } catch (e) { setError(`${file.name}: ${(e as Error).message}`); }
      finally { setUploading((n) => n - 1); }
    }));
    if (done.length) setItems((cur) => [...cur, ...done]);
  }
  const patch = (id: string, p: Partial<Item>) => setItems((cur) => cur.map((i) => (i.id === id ? { ...i, ...p } : i)));

  const priced = useMemo(() => items.map((i) => {
    const selections: Record<string, string> = {};
    if (paper) selections.paper_size = i.paperSize;
    if (colour) selections.color = i.color;
    if (sides) selections.sides = i.sides;
    try { return { id: i.id, total: computeLinePrice(config, selections, i.copies, i.pages).lineTotal, bad: null as string | null }; }
    catch (e) { return { id: i.id, total: 0, bad: (e as Error).message }; }
  }), [items, config, paper, colour, sides]);
  const totals = computeOrderTotals(priced.map((p) => p.total), 0, vatRate, pricesIncludeVat);

  /* ---------- step 3 ---------- */
  async function pay() {
    if (!provider) return;
    setError(null); setBusy(true);
    const res = await fetch(`/api/v1/store/${store}/walk-in/checkout`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, phone, provider, files: items.map((i) => ({ fileId: i.id, copies: i.copies, color: i.color, sides: i.sides, paperSize: i.paperSize, pages: i.pageCount == null ? i.pages : undefined })) }),
    });
    const j = await res.json().catch(() => ({}));
    if (res.ok && j.url) { window.location.href = j.url; return; }
    if (j.statusUrl) { window.location.href = j.statusUrl; return; } // order saved; status page offers "Pay now"
    setBusy(false); setError(j.error ?? "Something went wrong. Please try again.");
  }

  const choiceSelect = (g: OptionGroup | undefined, value: string, onChange: (v: string) => void, fallback: { value: string; label: string }[]) => (
    <Select value={value} onChange={(e) => onChange(e.target.value)} className="h-11">
      {(g?.choices ?? fallback).map((c) => <option key={c.value} value={c.value}>{c.label.split(" (")[0]}</option>)}
    </Select>
  );

  return (
    <div className="mx-auto max-w-md px-4 py-6" data-testid="walk-in-flow">
      <h1 className="text-2xl font-extrabold tracking-tight">Print now</h1>
      <p className="text-sm text-on-surface-variant">{shopName} · skip the queue: upload, pay, collect.</p>
      <ol className="my-5 flex gap-2 text-xs font-semibold" aria-label="Steps">
        {["Your details", "Your files", "Pay"].map((l, i) => (
          <li key={l} className={cn("flex-1 rounded-full px-2 py-1.5 text-center", step === i + 1 ? "btn-store" : step > i + 1 ? "bg-store-soft text-store" : "bg-surface-container text-on-surface-variant")}>{i + 1}. {l}</li>
        ))}
      </ol>
      {error && <div className="mb-4"><Alert>{error}</Alert></div>}

      {step === 1 && (
        <form onSubmit={start} className="space-y-4" data-testid="step-1">
          <Field label="Your name"><Input name="name" required minLength={2} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" className="h-12 text-base" /></Field>
          <Field label="Mobile number" hint="(we save it so you can come back quickly)">
            <Input name="phone" type="tel" inputMode="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="05x xxx xxxx" autoComplete="tel" className="h-12 text-base" />
          </Field>
          <Button variant="store" className="h-12 w-full text-base" disabled={busy} data-testid="start">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Continue</Button>
        </form>
      )}

      {step === 2 && (
        <div className="space-y-4" data-testid="step-2">
          {welcome && <Alert tone="green">Welcome back, {welcome}!</Alert>}
          <div
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files.length) void upload(e.dataTransfer.files); }}
            onClick={() => input.current?.click()}
            className={cn("flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed p-8 text-center", drag ? "border-store bg-store-soft" : "border-outline-variant bg-white")}
          >
            {uploading ? <Loader2 className="h-8 w-8 animate-spin text-store" /> : <Upload className="h-8 w-8 text-store" />}
            <p className="font-semibold">{uploading ? "Uploading…" : "Tap to choose your documents"}</p>
            <p className="text-xs text-on-surface-variant">PDF, Word, PowerPoint, Excel, JPG or PNG · up to {maxFiles} files · 50 MB each</p>
            <input ref={input} type="file" multiple accept={ACCEPT} className="hidden" data-testid="file-input" onChange={(e) => { if (e.target.files?.length) void upload(e.target.files); e.target.value = ""; }} />
          </div>

          {items.map((i) => {
            const p = priced.find((x) => x.id === i.id)!;
            return (
              <Card key={i.id} className="space-y-3 p-4" data-testid="file-card">
                <div className="flex items-start gap-3">
                  <FileText className="mt-0.5 h-5 w-5 shrink-0 text-outline" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{i.filename}</p>
                    {i.pageCount != null
                      ? <p className="text-xs text-on-surface-variant">{i.pageCount} page{i.pageCount > 1 ? "s" : ""}</p>
                      : <div className="mt-1 flex items-center gap-2 text-xs text-warning">
                          <label htmlFor={`pg-${i.id}`}>Pages:</label>
                          <input id={`pg-${i.id}`} type="number" min={1} max={2000} value={i.pages} onChange={(e) => patch(i.id, { pages: Math.max(1, Math.min(2000, Number(e.target.value) || 1)) })} className="h-8 w-16 rounded border border-warning/50 px-2" data-testid="pages-input" />
                          <span>unverified — the shop will check</span>
                        </div>}
                  </div>
                  <button type="button" aria-label="Remove file" onClick={() => setItems((c) => c.filter((x) => x.id !== i.id))} className="rounded p-1 text-outline hover:bg-surface-container"><X className="h-5 w-5" /></button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><p className="mb-1 text-xs font-medium text-on-surface-variant">Colour</p>{choiceSelect(colour, i.color, (v) => patch(i.id, { color: v }), [{ value: "bw", label: "Black & white" }, { value: "color", label: "Full colour" }])}</div>
                  <div><p className="mb-1 text-xs font-medium text-on-surface-variant">Sides</p>{choiceSelect(sides, i.sides, (v) => patch(i.id, { sides: v }), [{ value: "single", label: "Single-sided" }, { value: "double", label: "Double-sided" }])}</div>
                  <div><p className="mb-1 text-xs font-medium text-on-surface-variant">Paper</p>{choiceSelect(paper, i.paperSize, (v) => patch(i.id, { paperSize: v }), [{ value: "A4", label: "A4" }])}</div>
                  <div>
                    <p className="mb-1 text-xs font-medium text-on-surface-variant">Copies</p>
                    <div className="flex h-11 items-center justify-between rounded-lg border border-outline-variant bg-white">
                      <button type="button" aria-label="Fewer copies" className="px-3 py-2" onClick={() => patch(i.id, { copies: Math.max(1, i.copies - 1) })}><Minus className="h-4 w-4" /></button>
                      <span className="font-semibold" data-testid="copies">{i.copies}</span>
                      <button type="button" aria-label="More copies" className="px-3 py-2" onClick={() => patch(i.id, { copies: Math.min(200, i.copies + 1) })}><Plus className="h-4 w-4" /></button>
                    </div>
                  </div>
                </div>
                <p className="text-right text-sm font-semibold" data-testid="file-price">{p.bad ? <span className="text-critical">{p.bad}</span> : formatAED(p.total)}</p>
              </Card>
            );
          })}

          {items.length > 0 && (
            <div className="sticky bottom-0 -mx-4 border-t bg-white/95 p-4 backdrop-blur">
              <div className="mb-2 flex justify-between text-sm"><span className="text-on-surface-variant">Total incl. VAT {vatRate}%</span><b data-testid="total">{formatAED(totals.total)}</b></div>
              <Button variant="store" className="h-12 w-full text-base" disabled={!!uploading || priced.some((p) => p.bad)} onClick={() => { setError(null); setStep(3); }} data-testid="to-pay">Continue to payment</Button>
            </div>
          )}
          <button type="button" className="text-sm text-on-surface-variant underline" onClick={() => setStep(1)}>← Change my details</button>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4" data-testid="step-3">
          <Card className="divide-y divide-outline-variant">
            {items.map((i, idx) => (
              <div key={i.id} className="flex justify-between gap-3 p-3 text-sm"><span className="min-w-0 truncate">{i.filename} <span className="text-outline">× {i.copies}</span></span><span>{formatAED(priced[idx].total)}</span></div>
            ))}
            <div className="space-y-1 p-3 text-sm">
              <div className="flex justify-between text-on-surface-variant"><span>Subtotal</span><span>{formatAED(totals.subtotal)}</span></div>
              <div className="flex justify-between text-on-surface-variant"><span>VAT {vatRate}%</span><span>{formatAED(totals.vat)}</span></div>
              <div className="flex justify-between text-base font-bold"><span>Total</span><span>{formatAED(totals.total)}</span></div>
            </div>
          </Card>
          {providers.length === 0
            ? <Alert tone="yellow">Online payment isn&apos;t set up at this shop yet. Please ask the staff at the counter.</Alert>
            : <div className="space-y-2">
                <div className="flex items-center gap-3 rounded-xl border border-store bg-store-soft p-4">
                  <CreditCard className="h-5 w-5" /><span className="text-sm font-medium">Pay by card, Apple Pay or Google Pay</span>
                </div>
                <p className="text-xs text-on-surface-variant">Online payment only — no cash. Printing starts as soon as you&apos;ve paid.</p>
              </div>}
          <Button variant="store" className="h-12 w-full text-base" disabled={busy || !provider} onClick={pay} data-testid="pay">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}Pay {formatAED(totals.total)}</Button>
          <button type="button" className="text-sm text-on-surface-variant underline" onClick={() => setStep(2)}>← Back to my files</button>
        </div>
      )}
    </div>
  );
}
