"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, ChevronUp, ChevronDown } from "lucide-react";
import type { OptionChoice, OptionGroup, ProductConfig, ProductKind, Selections } from "@/lib/types";
import { computeLinePrice, formatAED, PricingError } from "@/lib/pricing";
import { Alert, Button, Card, CardHeader, Field, Input, Label, Select, Textarea } from "@/components/ui";

export interface EditableProduct {
  id: string; kind: ProductKind; name: string; slug: string; description: string; imageUrl: string;
  turnaroundHours: number; active: boolean; featured: boolean; sortOrder: number; config: ProductConfig;
}

const numOrUndef = (s: string) => (s.trim() === "" ? undefined : Number(s));

export function ProductEditor({ product, storeSlug }: { product: EditableProduct; storeSlug: string }) {
  const router = useRouter();
  const [p, setP] = useState(product);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const cfg = p.config;
  const setCfg = (c: Partial<ProductConfig>) => setP({ ...p, config: { ...cfg, ...c } });
  const setGroup = (gi: number, g: Partial<OptionGroup>) => setCfg({ optionGroups: cfg.optionGroups.map((x, i) => (i === gi ? { ...x, ...g } : x)) });
  const setChoice = (gi: number, ci: number, c: Partial<OptionChoice>) =>
    setGroup(gi, { choices: cfg.optionGroups[gi].choices.map((x, i) => (i === ci ? { ...x, ...c } : x)) });
  const moveGroup = (gi: number, d: -1 | 1) => {
    const arr = [...cfg.optionGroups]; const j = gi + d; if (j < 0 || j >= arr.length) return;
    [arr[gi], arr[j]] = [arr[j], arr[gi]]; setCfg({ optionGroups: arr });
  };

  // live preview
  const [qty, setQty] = useState(String(cfg.quantityPresets?.[0] ?? cfg.minQuantity ?? 1));
  const [pages, setPages] = useState("10");
  const [sel, setSel] = useState<Selections>({});
  const preview = useMemo(() => {
    try { return { r: computeLinePrice(cfg, sel, Number(qty), Number(pages)) }; }
    catch (e) { return { e: e instanceof PricingError ? e.message : "Invalid configuration" }; }
  }, [cfg, sel, qty, pages]);

  async function save() {
    setSaving(true); setMsg({});
    const res = await fetch(`/api/v1/admin/products/${p.id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(p) });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) return setMsg({ error: data.error ?? "Save failed" });
    setMsg({ ok: "Saved" }); router.refresh();
  }
  async function del() {
    if (!confirm(`Delete "${p.name}"? Existing orders keep their details.`)) return;
    const res = await fetch(`/api/v1/admin/products/${p.id}`, { method: "DELETE" });
    if (res.ok) router.push("/admin/products?ok=Product%20deleted"); else setMsg({ error: "Delete failed" });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><Link href="/admin/products" className="text-sm text-slate-500 hover:underline">← Products</Link><h1 className="text-2xl font-bold">{p.name}</h1></div>
        <div className="flex gap-2">
          <a className="inline-flex items-center rounded-lg px-3 text-sm text-slate-600 hover:underline" target="_blank" href={`/s/${storeSlug}/p/${p.slug}`}>View in store ↗</a>
          <Button variant="secondary" onClick={del}><Trash2 size={16} />Delete</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button>
        </div>
      </div>
      {msg.error && <Alert>{msg.error}</Alert>}
      {msg.ok && <Alert tone="green">{msg.ok}</Alert>}

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card>
            <CardHeader title="Details" />
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <Field label="Name"><Input value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} /></Field>
              <Field label="URL slug"><Input value={p.slug} onChange={(e) => setP({ ...p, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") })} /></Field>
              <div className="sm:col-span-2"><Field label="Description"><Textarea rows={3} value={p.description} onChange={(e) => setP({ ...p, description: e.target.value })} /></Field></div>
              <Field label="Image URL"><Input value={p.imageUrl} placeholder="https://…" onChange={(e) => setP({ ...p, imageUrl: e.target.value })} /></Field>
              <Field label="Turnaround (hours)"><Input type="number" min={0} value={p.turnaroundHours} onChange={(e) => setP({ ...p, turnaroundHours: Number(e.target.value) || 0 })} /></Field>
              <Field label="Sort order"><Input type="number" value={p.sortOrder} onChange={(e) => setP({ ...p, sortOrder: Number(e.target.value) || 0 })} /></Field>
              <div className="flex flex-wrap items-end gap-4 text-sm">
                <Check label="Active" v={p.active} on={(v) => setP({ ...p, active: v })} />
                <Check label="Featured" v={p.featured} on={(v) => setP({ ...p, featured: v })} />
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Pricing basics" subtitle="Unit price comes from the highest tier whose minimum is reached. Unit = one page for per-page products." />
            <div className="space-y-4 p-5">
              <div className="flex flex-wrap gap-4 text-sm">
                <Check label="Priced per page (documents)" v={!!cfg.perPage} on={(v) => setCfg({ perPage: v })} />
                <Check label="Customer must upload a file" v={!!cfg.requiresUpload} on={(v) => setCfg({ requiresUpload: v })} />
                <Check label="Business card designer" v={!!cfg.designer} on={(v) => setCfg({ designer: v })} />
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Accepted files"><Input value={cfg.acceptedFiles ?? ""} placeholder=".pdf,.jpg" onChange={(e) => setCfg({ acceptedFiles: e.target.value || undefined })} /></Field>
                <Field label="Minimum quantity"><Input type="number" min={1} value={cfg.minQuantity ?? ""} onChange={(e) => setCfg({ minQuantity: numOrUndef(e.target.value) })} /></Field>
                <Field label="Quantity presets" hint="comma separated, empty = free input">
                  <Input defaultValue={(cfg.quantityPresets ?? []).join(", ")} onBlur={(e) => {
                    const arr = e.target.value.split(/[,\s]+/).map(Number).filter((n) => Number.isInteger(n) && n > 0);
                    setCfg({ quantityPresets: arr.length ? [...new Set(arr)].sort((a, b) => a - b) : undefined });
                  }} />
                </Field>
              </div>
              <div>
                <Label>Quantity tiers</Label>
                <div className="space-y-2">
                  {cfg.tiers.map((t, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <span className="w-16 text-slate-500">From</span>
                      <Input type="number" min={1} className="w-28" value={t.min} onChange={(e) => setCfg({ tiers: cfg.tiers.map((x, j) => (j === i ? { ...x, min: Number(e.target.value) || 1 } : x)) })} />
                      <span className="text-slate-500">units: AED</span>
                      <Input type="number" step="0.01" min={0} className="w-28" value={t.unitPrice} onChange={(e) => setCfg({ tiers: cfg.tiers.map((x, j) => (j === i ? { ...x, unitPrice: Number(e.target.value) || 0 } : x)) })} />
                      <span className="text-slate-500">/ unit</span>
                      <button type="button" className="text-slate-400 hover:text-red-600" onClick={() => setCfg({ tiers: cfg.tiers.filter((_, j) => j !== i) })} aria-label="Remove tier"><Trash2 size={16} /></button>
                    </div>
                  ))}
                  <Button type="button" variant="ghost" onClick={() => setCfg({ tiers: [...cfg.tiers, { min: (cfg.tiers.at(-1)?.min ?? 0) * 2 || 1, unitPrice: cfg.tiers.at(-1)?.unitPrice ?? 1 }] })}><Plus size={16} />Add tier</Button>
                </div>
              </div>
            </div>
          </Card>

          {cfg.optionGroups.map((g, gi) => (
            <Card key={gi}>
              <div className="flex flex-wrap items-end gap-3 border-b px-5 py-4">
                <div className="w-44"><Label>Label</Label><Input value={g.label} onChange={(e) => setGroup(gi, { label: e.target.value })} /></div>
                <div className="w-36"><Label>Key</Label><Input value={g.key} onChange={(e) => setGroup(gi, { key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })} /></div>
                <div className="w-28"><Label>Display</Label><Select value={g.type} onChange={(e) => setGroup(gi, { type: e.target.value as "select" | "radio" })}><option value="select">Dropdown</option><option value="radio">Buttons</option></Select></div>
                <div className="w-44"><Label>Default</Label><Select value={g.default ?? ""} onChange={(e) => setGroup(gi, { default: e.target.value || undefined })}><option value="">First choice</option>{g.choices.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</Select></div>
                <Check label="Required" v={!!g.required} on={(v) => setGroup(gi, { required: v })} />
                <div className="ml-auto flex gap-1">
                  <Button type="button" variant="ghost" onClick={() => moveGroup(gi, -1)} aria-label="Move up"><ChevronUp size={16} /></Button>
                  <Button type="button" variant="ghost" onClick={() => moveGroup(gi, 1)} aria-label="Move down"><ChevronDown size={16} /></Button>
                  <Button type="button" variant="ghost" onClick={() => setCfg({ optionGroups: cfg.optionGroups.filter((_, i) => i !== gi) })}><Trash2 size={16} /></Button>
                </div>
              </div>
              <div className="overflow-x-auto p-3">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase text-slate-500"><tr><th className="p-2">Label</th><th className="p-2">Value</th><th className="p-2" title="Added to unit price">+ AED / unit</th><th className="p-2" title="Multiplies the unit price">× Multiplier</th><th className="p-2" title="One-off fee per line">+ Flat fee</th><th /></tr></thead>
                  <tbody>
                    {g.choices.map((c, ci) => (
                      <tr key={ci}>
                        <td className="p-1"><Input value={c.label} onChange={(e) => setChoice(gi, ci, { label: e.target.value })} /></td>
                        <td className="w-32 p-1"><Input value={c.value} onChange={(e) => setChoice(gi, ci, { value: e.target.value })} /></td>
                        <td className="w-28 p-1"><Input type="number" step="0.01" value={c.addPerUnit ?? ""} onChange={(e) => setChoice(gi, ci, { addPerUnit: numOrUndef(e.target.value) })} /></td>
                        <td className="w-28 p-1"><Input type="number" step="0.05" min={0} value={c.multiplier ?? ""} onChange={(e) => setChoice(gi, ci, { multiplier: numOrUndef(e.target.value) })} /></td>
                        <td className="w-28 p-1"><Input type="number" step="0.5" min={0} value={c.flat ?? ""} onChange={(e) => setChoice(gi, ci, { flat: numOrUndef(e.target.value) })} /></td>
                        <td className="p-1"><button type="button" className="text-slate-400 hover:text-red-600" onClick={() => setGroup(gi, { choices: g.choices.filter((_, i) => i !== ci) })} aria-label="Remove choice"><Trash2 size={16} /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <Button type="button" variant="ghost" onClick={() => setGroup(gi, { choices: [...g.choices, { value: `option${g.choices.length + 1}`, label: "New option" }] })}><Plus size={16} />Add choice</Button>
              </div>
            </Card>
          ))}
          <Button type="button" variant="secondary" onClick={() => setCfg({ optionGroups: [...cfg.optionGroups, { key: `option_${cfg.optionGroups.length + 1}`, label: "New option", type: "select", choices: [{ value: "standard", label: "Standard" }] }] })}><Plus size={16} />Add option group</Button>
        </div>

        <div>
          <Card className="sticky top-6">
            <CardHeader title="Live price preview" subtitle="Exactly what customers will be charged (excl. VAT)" />
            <div className="space-y-3 p-5">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Quantity">
                  {cfg.quantityPresets?.length ? (
                    <Select value={qty} onChange={(e) => setQty(e.target.value)}>{cfg.quantityPresets.map((q) => <option key={q}>{q}</option>)}</Select>
                  ) : <Input type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} />}
                </Field>
                {cfg.perPage && <Field label="Pages"><Input type="number" min={1} value={pages} onChange={(e) => setPages(e.target.value)} /></Field>}
              </div>
              {cfg.optionGroups.map((g) => (
                <Field key={g.key} label={g.label}>
                  <Select value={sel[g.key] ?? g.default ?? g.choices[0]?.value} onChange={(e) => setSel({ ...sel, [g.key]: e.target.value })}>
                    {g.choices.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </Select>
                </Field>
              ))}
              {"e" in preview ? <Alert tone="yellow">{preview.e}</Alert> : (
                <div className="rounded-lg bg-slate-50 p-4 text-sm">
                  <div className="flex justify-between"><span>Unit price</span><span>{formatAED(preview.r!.unitPrice)}</span></div>
                  <div className="flex justify-between"><span>Units</span><span>{preview.r!.units}</span></div>
                  {preview.r!.setupFees > 0 && <div className="flex justify-between"><span>Setup / finishing</span><span>{formatAED(preview.r!.setupFees)}</span></div>}
                  <div className="mt-2 flex justify-between border-t pt-2 text-lg font-bold"><span>Line total</span><span>{formatAED(preview.r!.lineTotal)}</span></div>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Check({ label, v, on }: { label: string; v: boolean; on: (v: boolean) => void }) {
  return <label className="inline-flex cursor-pointer items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4" checked={v} onChange={(e) => on(e.target.checked)} />{label}</label>;
}
