"use client";
/** Sections shared by the guided ProductBuilder and the ProductEditor: photos, pricing + margin, options, personalisation, print area, live price preview. */
import { useId, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent as RPointerEvent } from "react";
import { ArrowLeft, ArrowRight, ImagePlus, Plus, Star, Trash2, ChevronUp, ChevronDown } from "lucide-react";
import type { MockupArea, OptionChoice, OptionGroup, Personalisation, PersonalisationField, ProductConfig, QuantityTier, Selections } from "@/lib/types";
import { PERSONALISATION_PREFIX } from "@/lib/types";
import { computeLinePrice, formatAED, PricingError } from "@/lib/pricing";
import { marginAt, marginTone, suggestPrice } from "@/lib/margin";
import { Alert, Badge, Button, Field, Input, Select, Textarea } from "@/components/ui";
import { Switch } from "@/components/ui/switch";
import { DEFAULT_MOCKUP, fitArea } from "@/lib/print-area";
export { DEFAULT_MOCKUP };

export const MAX_PHOTOS = 8;
export const numOrUndef = (s: string) => (s.trim() === "" ? undefined : Number(s));
export const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
export const keyify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);

/* ------------------------------ Photos ------------------------------------------ */
/** Ordered gallery. photos[0] is the cover. Uploads go to /api/v1/admin/products/upload and come back as a URL the storefront can load. */
export function PhotoManager({ photos, onChange }: { photos: string[]; onChange: (p: string[]) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [url, setUrl] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const live = useRef(photos); live.current = photos;

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true); setErr("");
    for (const f of Array.from(files)) {
      if (live.current.length >= MAX_PHOTOS) { setErr(`Up to ${MAX_PHOTOS} photos`); break; }
      const fd = new FormData(); fd.set("file", f);
      const res = await fetch("/api/v1/admin/products/upload", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(`${f.name}: ${data.error ?? "Upload failed"}`); continue; }
      const next = [...live.current, data.url as string]; live.current = next; onChange(next);
    }
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
  }
  const move = (i: number, d: -1 | 1) => { const a = [...photos]; const j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; onChange(a); };
  const cover = (i: number) => { const a = [...photos]; const [x] = a.splice(i, 1); a.unshift(x); onChange(a); };
  const addUrl = () => {
    const u = url.trim();
    if (!/^https?:\/\/\S+$/.test(u)) return setErr("Enter a web address starting with https://");
    if (photos.length >= MAX_PHOTOS) return setErr(`Up to ${MAX_PHOTOS} photos`);
    setErr(""); setUrl(""); onChange([...photos, u]);
  };
  const btn = "grid min-h-11 min-w-11 place-items-center rounded-shape-sm border border-outline-variant bg-surface-lowest text-on-surface-variant hover:text-primary disabled:opacity-40";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input ref={inputRef} id="photo-input" type="file" accept="image/png,image/jpeg,image/webp" multiple className="sr-only" onChange={(e) => upload(e.target.files)} data-testid="photo-input" />
        <label htmlFor="photo-input" className="state-layer inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-shape-md bg-secondary-container px-4 text-sm font-semibold text-on-secondary-container focus-within:ring-2 focus-within:ring-primary">
          <ImagePlus size={16} />{busy ? "Uploading…" : "Upload photos"}
        </label>
        <span className="text-sm text-on-surface-variant">JPG, PNG or WebP, up to 5 MB each. {photos.length}/{MAX_PHOTOS} added.</span>
      </div>
      {err && <Alert>{err}</Alert>}
      {photos.length === 0 ? (
        <p className="rounded-shape-md border border-dashed border-outline-variant p-6 text-center text-sm text-on-surface-variant">No photos yet. The first photo is the cover customers see in the shop. A clear photo of the blank product works best for the print-area preview.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" data-testid="photo-list">
          {photos.map((src, i) => (
            <li key={src} className="space-y-2 rounded-shape-md border border-outline-variant p-2">
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt={`Product photo ${i + 1}`} className="aspect-square w-full rounded-shape-sm object-cover" />
                {i === 0 && <span className="absolute start-1 top-1"><Badge tone="blue">Cover</Badge></span>}
              </div>
              <div className="flex flex-wrap gap-1">
                <button type="button" className={btn} onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move photo ${i + 1} earlier`}><ArrowLeft size={16} /></button>
                <button type="button" className={btn} onClick={() => move(i, 1)} disabled={i === photos.length - 1} aria-label={`Move photo ${i + 1} later`}><ArrowRight size={16} /></button>
                <button type="button" className={btn} onClick={() => cover(i)} disabled={i === 0} aria-label={`Make photo ${i + 1} the cover`}><Star size={16} /></button>
                <button type="button" className={`${btn} hover:text-critical`} onClick={() => onChange(photos.filter((_, j) => j !== i))} aria-label={`Remove photo ${i + 1}`}><Trash2 size={16} /></button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1 sm:max-w-md"><Field label="Or paste a photo link"><Input value={url} placeholder="https://…" onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addUrl(); } }} /></Field></div>
        <Button type="button" variant="tonal" onClick={addUrl}>Add link</Button>
      </div>
    </div>
  );
}

/* ------------------------------ Pricing + margin ---------------------------------- */
const toneBadge = { loss: "red", thin: "yellow", healthy: "green" } as const;
const toneText = { loss: "Loss", thin: "Thin", healthy: "Healthy" } as const;

export function TierPricing({ tiers, onTiers, cost, onCost, target, onTarget }: {
  tiers: QuantityTier[]; onTiers: (t: QuantityTier[]) => void;
  cost: number | undefined; onCost: (c: number | undefined) => void; target: number; onTarget: (n: number) => void;
}) {
  const hasCost = cost !== undefined && cost > 0;
  const suggested = hasCost ? suggestPrice(cost!, target) : 0;
  const setTier = (i: number, t: Partial<QuantityTier>) => onTiers(tiers.map((x, j) => (j === i ? { ...x, ...t } : x)));
  const volume = () => {
    const base = tiers[0]?.unitPrice ?? 0;
    const r = (n: number) => Math.round(n * 100) / 100;
    onTiers([{ min: 1, unitPrice: base }, { min: 12, unitPrice: r(base * 0.9) }, { min: 48, unitPrice: r(base * 0.8) }]);
  };
  return (
    <div className="space-y-6">
      <div>
        <h4 className="mb-2 text-sm font-semibold">Quantity tiers</h4>
        <p className="mb-3 text-sm text-on-surface-variant">The unit price comes from the highest tier whose minimum is reached. Add tiers to reward bigger orders.</p>
        <div className="space-y-3">
          {tiers.map((t, i) => {
            const m = hasCost ? marginAt(cost!, t.unitPrice) : null;
            const tone = m ? marginTone(m.marginPct) : null;
            return (
              <div key={i} className="flex flex-wrap items-end gap-3 rounded-shape-md border border-outline-variant p-3" data-testid="tier-row">
                <div className="w-28"><Field label={i === 0 ? "From (units)" : "From"}><Input type="number" min={1} value={t.min} onChange={(e) => setTier(i, { min: Math.max(1, Math.floor(Number(e.target.value)) || 1) })} /></Field></div>
                <div className="w-36"><Field label="Price per unit (AED)"><Input type="number" step="0.01" min={0} value={t.unitPrice} onChange={(e) => setTier(i, { unitPrice: Math.max(0, Number(e.target.value) || 0) })} /></Field></div>
                {m && tone && (
                  <div className="flex min-h-11 items-center gap-2 text-sm tabular-nums" aria-live="polite">
                    <Badge tone={toneBadge[tone]} dot>{toneText[tone]}</Badge>
                    <span>Profit {formatAED(m.profit)} per unit</span><span className="text-on-surface-variant">·</span><span>{m.marginPct}% margin</span>
                  </div>
                )}
                {tiers.length > 1 && <button type="button" className="ms-auto grid min-h-11 min-w-11 place-items-center text-outline hover:text-critical" onClick={() => onTiers(tiers.filter((_, j) => j !== i))} aria-label={`Remove tier ${i + 1}`}><Trash2 size={16} /></button>}
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" variant="tonal" onClick={() => onTiers([...tiers, { min: (tiers.at(-1)?.min ?? 0) * 2 || 1, unitPrice: tiers.at(-1)?.unitPrice ?? 1 }])}><Plus size={16} />Add tier</Button>
          <Button type="button" variant="text" onClick={volume}>Fill 12+ and 48+ discounts (10% and 20% off)</Button>
        </div>
      </div>

      <div className="rounded-shape-lg bg-surface-low p-4">
        <h4 className="text-sm font-semibold">Cost and margin <span className="ms-1 text-xs font-normal text-on-surface-variant">Private: only you and your staff see this, never customers.</span></h4>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Field label="Your cost per unit (AED)" hint="blank, print, labour"><Input type="number" step="0.01" min={0} value={cost ?? ""} onChange={(e) => onCost(numOrUndef(e.target.value))} data-testid="cost-input" /></Field>
          <Field label="Target margin (%)"><Input type="number" step="1" min={0} max={95} value={target} onChange={(e) => onTarget(Math.min(95, Math.max(0, Number(e.target.value) || 0)))} /></Field>
          <div className="flex items-end gap-2 pb-0.5">
            {hasCost ? (
              <div className="text-sm"><div className="text-on-surface-variant">Suggested price</div><div className="text-lg font-bold tabular-nums" data-testid="suggested-price">{formatAED(suggested)}</div></div>
            ) : <p className="text-sm text-on-surface-variant">Enter your cost to see a suggested price and the profit at every tier.</p>}
          </div>
        </div>
        {hasCost && suggested > 0 && <Button type="button" variant="outlined" className="mt-3" onClick={() => setTier(0, { unitPrice: suggested })}>Use {formatAED(suggested)} for the first tier</Button>}
      </div>
    </div>
  );
}

/* ------------------------------ Options ----------------------------------------- */
const ch = (value: string, label: string, extra: Partial<OptionChoice> = {}): OptionChoice => ({ value, label, ...extra });
export const OPTION_PRESETS: { id: string; label: string; group: OptionGroup }[] = [
  { id: "size", label: "T-shirt sizes S to 3XL", group: { key: "size", label: "Size", type: "select", required: true, default: "m", choices: [ch("s", "S"), ch("m", "M"), ch("l", "L"), ch("xl", "XL"), ch("2xl", "2XL", { addPerUnit: 4 }), ch("3xl", "3XL", { addPerUnit: 6 })] } },
  { id: "colour", label: "Colours", group: { key: "colour", label: "Colour", type: "select", required: true, default: "white", choices: [ch("white", "White"), ch("black", "Black"), ch("navy", "Navy"), ch("red", "Red")] } },
  { id: "print_position", label: "Print position", group: { key: "print_position", label: "Print position", type: "select", required: true, default: "front", choices: [ch("front", "Front"), ch("back", "Back", { addPerUnit: 8 }), ch("front_back", "Front + back", { addPerUnit: 14 })] } },
  { id: "material", label: "Material", group: { key: "material", label: "Material", type: "select", required: true, default: "standard", choices: [ch("standard", "Standard"), ch("premium", "Premium", { addPerUnit: 5 })] } },
  { id: "box_size", label: "Box size", group: { key: "box_size", label: "Box size", type: "select", required: true, default: "medium", choices: [ch("small", "Small"), ch("medium", "Medium", { addPerUnit: 6 }), ch("large", "Large", { addPerUnit: 12 })] } },
  { id: "ribbon", label: "Ribbon", group: { key: "ribbon", label: "Ribbon", type: "select", default: "none", choices: [ch("none", "No ribbon"), ch("satin", "Satin ribbon", { addPerUnit: 2 }), ch("gold", "Gold ribbon", { addPerUnit: 3 })] } },
];

export function OptionGroupsEditor({ groups, onChange }: { groups: OptionGroup[]; onChange: (g: OptionGroup[]) => void }) {
  const setGroup = (gi: number, g: Partial<OptionGroup>) => onChange(groups.map((x, i) => (i === gi ? { ...x, ...g } : x)));
  const setChoice = (gi: number, ci: number, c: Partial<OptionChoice>) => setGroup(gi, { choices: groups[gi].choices.map((x, i) => (i === ci ? { ...x, ...c } : x)) });
  const moveGroup = (gi: number, d: -1 | 1) => { const a = [...groups]; const j = gi + d; if (j < 0 || j >= a.length) return; [a[gi], a[j]] = [a[j], a[gi]]; onChange(a); };
  const used = new Set(groups.map((g) => g.key));
  const addPreset = (p: (typeof OPTION_PRESETS)[number]) => {
    let key = p.group.key, n = 2;
    while (used.has(key)) key = `${p.group.key}_${n++}`;
    onChange([...groups, { ...p.group, key, choices: p.group.choices.map((c) => ({ ...c })) }]);
  };
  const cell = "p-1";
  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-sm font-medium">Quick add</p>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Option presets">
          {OPTION_PRESETS.map((p) => <Button key={p.id} type="button" variant="outlined" size="sm" className="[@media(pointer:coarse)]:min-h-11" onClick={() => addPreset(p)}><Plus size={14} />{p.label}</Button>)}
        </div>
      </div>
      {groups.length === 0 && <p className="rounded-shape-md border border-dashed border-outline-variant p-4 text-sm text-on-surface-variant">No options yet. Options are optional: add sizes, colours or finishes customers choose from, each with its own price effect.</p>}
      {groups.map((g, gi) => (
        <div key={gi} className="rounded-shape-lg border border-outline-variant" data-testid="option-group">
          <div className="flex flex-wrap items-end gap-3 border-b border-outline-variant/70 px-4 py-3">
            <div className="w-44"><Field label="Label"><Input value={g.label} onChange={(e) => setGroup(gi, { label: e.target.value })} /></Field></div>
            <div className="w-36"><Field label="Key"><Input value={g.key} onChange={(e) => setGroup(gi, { key: keyify(e.target.value) })} /></Field></div>
            <div className="w-32"><Field label="Display"><Select value={g.type} onChange={(e) => setGroup(gi, { type: e.target.value as "select" | "radio" })}><option value="select">Dropdown</option><option value="radio">Buttons</option></Select></Field></div>
            <div className="w-40"><Field label="Default"><Select value={g.default ?? ""} onChange={(e) => setGroup(gi, { default: e.target.value || undefined })}><option value="">First choice</option>{g.choices.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</Select></Field></div>
            <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm"><input type="checkbox" className="size-5" checked={!!g.required} onChange={(e) => setGroup(gi, { required: e.target.checked })} />Required</label>
            <div className="ms-auto flex gap-1">
              <Button type="button" variant="ghost" onClick={() => moveGroup(gi, -1)} aria-label={`Move ${g.label} up`}><ChevronUp size={16} /></Button>
              <Button type="button" variant="ghost" onClick={() => moveGroup(gi, 1)} aria-label={`Move ${g.label} down`}><ChevronDown size={16} /></Button>
              <Button type="button" variant="ghost" onClick={() => onChange(groups.filter((_, i) => i !== gi))} aria-label={`Remove ${g.label}`}><Trash2 size={16} /></Button>
            </div>
          </div>
          <div className="overflow-x-auto p-3">
            <table className="w-full text-sm">
              <thead className="text-start text-xs uppercase text-on-surface-variant"><tr><th className="p-2 text-start">Choice</th><th className="p-2 text-start">Value</th><th className="p-2 text-start" title="Added to the unit price">+ AED / unit</th><th className="p-2 text-start" title="Multiplies the unit price">× Multiplier</th><th className="p-2 text-start" title="One-off fee per order line">+ Flat fee</th><th /></tr></thead>
              <tbody>
                {g.choices.map((c, ci) => (
                  <tr key={ci}>
                    <td className={cell}><Input aria-label={`${g.label} choice ${ci + 1} label`} value={c.label} onChange={(e) => setChoice(gi, ci, { label: e.target.value })} /></td>
                    <td className={`${cell} w-32`}><Input aria-label={`${g.label} choice ${ci + 1} value`} value={c.value} onChange={(e) => setChoice(gi, ci, { value: e.target.value })} /></td>
                    <td className={`${cell} w-28`}><Input aria-label={`${g.label} choice ${ci + 1} add per unit`} type="number" step="0.01" value={c.addPerUnit ?? ""} onChange={(e) => setChoice(gi, ci, { addPerUnit: numOrUndef(e.target.value) })} /></td>
                    <td className={`${cell} w-28`}><Input aria-label={`${g.label} choice ${ci + 1} multiplier`} type="number" step="0.05" min={0} value={c.multiplier ?? ""} onChange={(e) => setChoice(gi, ci, { multiplier: numOrUndef(e.target.value) })} /></td>
                    <td className={`${cell} w-28`}><Input aria-label={`${g.label} choice ${ci + 1} flat fee`} type="number" step="0.5" min={0} value={c.flat ?? ""} onChange={(e) => setChoice(gi, ci, { flat: numOrUndef(e.target.value) })} /></td>
                    <td className={cell}><button type="button" className="grid min-h-11 min-w-11 place-items-center text-outline hover:text-critical" onClick={() => setGroup(gi, { choices: g.choices.filter((_, i) => i !== ci) })} aria-label={`Remove choice ${c.label}`}><Trash2 size={16} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Button type="button" variant="text" onClick={() => setGroup(gi, { choices: [...g.choices, { value: `option${g.choices.length + 1}`, label: "New choice" }] })}><Plus size={16} />Add choice</Button>
          </div>
        </div>
      ))}
      <Button type="button" variant="tonal" onClick={() => { let n = groups.length + 1; while (used.has(`option_${n}`)) n++; onChange([...groups, { key: `option_${n}`, label: "New option", type: "select", choices: [{ value: "standard", label: "Standard" }] }]); }}><Plus size={16} />Add your own option</Button>
    </div>
  );
}

/* ------------------------------ Personalisation ------------------------------------ */
export const EMPTY_PERSONALISATION: Personalisation = { fields: [], artwork: "none" };

export function PersonalisationEditor({ value, onChange }: { value: Personalisation; onChange: (p: Personalisation) => void }) {
  const setField = (i: number, f: Partial<PersonalisationField>) => onChange({ ...value, fields: value.fields.map((x, j) => (j === i ? { ...x, ...f } : x)) });
  const addField = () => {
    const keys = new Set(value.fields.map((f) => f.key));
    let key = "text", n = 2; while (keys.has(key)) key = `text_${n++}`;
    onChange({ ...value, fields: [...value.fields, { key, label: "Your text", type: "text", maxLength: 30 }] });
  };
  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <h4 className="text-sm font-semibold">Text customers can add</h4>
        {value.fields.length === 0 && <p className="rounded-shape-md border border-dashed border-outline-variant p-4 text-sm text-on-surface-variant">No text fields. Add one for a name on a mug, a message on a gift card or a team number.</p>}
        {value.fields.map((f, i) => (
          <div key={i} className="flex flex-wrap items-end gap-3 rounded-shape-md border border-outline-variant p-3" data-testid="personalisation-field">
            <div className="w-52"><Field label="Label shown to customer"><Input value={f.label} onChange={(e) => setField(i, { label: e.target.value })} /></Field></div>
            <div className="w-32"><Field label="Key"><Input value={f.key} onChange={(e) => setField(i, { key: keyify(e.target.value) })} /></Field></div>
            <div className="w-32"><Field label="Type"><Select value={f.type} onChange={(e) => setField(i, { type: e.target.value as "text" | "textarea" })}><option value="text">One line</option><option value="textarea">Several lines</option></Select></Field></div>
            <div className="w-28"><Field label="Max characters"><Input type="number" min={1} max={500} value={f.maxLength} onChange={(e) => setField(i, { maxLength: Math.min(500, Math.max(1, Math.floor(Number(e.target.value)) || 1)) })} /></Field></div>
            <div className="w-28"><Field label="Extra fee (AED)"><Input type="number" min={0} step="0.5" value={f.flat ?? ""} onChange={(e) => setField(i, { flat: numOrUndef(e.target.value) })} /></Field></div>
            <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm"><input type="checkbox" className="size-5" checked={!!f.required} onChange={(e) => setField(i, { required: e.target.checked })} />Required</label>
            <button type="button" className="ms-auto grid min-h-11 min-w-11 place-items-center text-outline hover:text-critical" onClick={() => onChange({ ...value, fields: value.fields.filter((_, j) => j !== i) })} aria-label={`Remove field ${f.label}`}><Trash2 size={16} /></button>
          </div>
        ))}
        {value.fields.length < 10 && <Button type="button" variant="tonal" onClick={addField}><Plus size={16} />Add a text field</Button>}
      </div>
      <div className="max-w-sm">
        <Field label="Customer artwork upload" hint="logo, photo or design file">
          <Select value={value.artwork} onChange={(e) => onChange({ ...value, artwork: e.target.value as Personalisation["artwork"] })}>
            <option value="none">Not offered</option><option value="optional">Optional</option><option value="required">Required before ordering</option>
          </Select>
        </Field>
      </div>
    </div>
  );
}

/* ------------------------------ Print-area placement -------------------------------- */
export function MockupEditor({ cover, value, onChange }: { cover?: string; value: MockupArea; onChange: (m: MockupArea) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ mode: "move" | "size"; sx: number; sy: number; a: MockupArea } | null>(null);
  const id = useId();
  const down = (mode: "move" | "size") => (e: RPointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { mode, sx: e.clientX, sy: e.clientY, a: value };
  };
  const move = (e: RPointerEvent) => {
    const d = drag.current, r = box.current?.getBoundingClientRect();
    if (!d || !r?.width || !r.height) return;
    const dx = ((e.clientX - d.sx) / r.width) * 100, dy = ((e.clientY - d.sy) / r.height) * 100;
    onChange(fitArea(d.mode === "move" ? { ...d.a, x: d.a.x + dx, y: d.a.y + dy } : { ...d.a, w: Math.min(d.a.w + dx, 100 - d.a.x), h: Math.min(d.a.h + dy, 100 - d.a.y) }));
  };
  const up = () => { drag.current = null; };
  const key = (e: KeyboardEvent) => {
    const step = e.shiftKey ? 5 : 1;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (!d) return;
    e.preventDefault();
    onChange(fitArea(e.altKey ? { ...value, w: value.w + d[0], h: value.h + d[1] } : { ...value, x: value.x + d[0], y: value.y + d[1] }));
  };
  const num = (k: "x" | "y" | "w" | "h", label: string) => (
    <Field label={label}><Input type="number" min={0} max={100} step="0.5" value={value[k]} onChange={(e) => onChange(fitArea({ ...value, [k]: Number(e.target.value) || 0 }))} data-testid={`mockup-${k}`} /></Field>
  );
  return (
    <div className="space-y-4">
      <Switch checked={value.enabled} onChange={(v) => onChange({ ...value, enabled: v })} label="Show a live preview on the product photo" hint="Customers see their artwork placed inside this rectangle." />
      {value.enabled && (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_16rem]">
          <div>
            <div ref={box} className="relative mx-auto w-full max-w-md select-none overflow-hidden rounded-shape-md border border-outline-variant bg-surface-container" style={{ touchAction: "none" }}
              onPointerMove={move} onPointerUp={up} onPointerCancel={up} data-testid="mockup-stage">
              {cover
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={cover} alt="Cover photo with the print area" className="block w-full" draggable={false} />
                : <div className="grid aspect-square place-items-center p-6 text-center text-sm text-on-surface-variant">Add a cover photo in the Photos step to see the print area on it.</div>}
              <div role="group" tabIndex={0} aria-label="Print area. Drag, or use arrow keys to move, Alt and arrow keys to resize."
                onPointerDown={down("move")} onKeyDown={key}
                className="absolute cursor-move border-2 border-dashed border-primary bg-primary/15 outline-none focus-visible:ring-2 focus-visible:ring-primary"
                style={{ left: `${value.x}%`, top: `${value.y}%`, width: `${value.w}%`, height: `${value.h}%` }} data-testid="mockup-rect">
                <span onPointerDown={down("size")} aria-hidden className="absolute -bottom-3 -right-3 size-6 cursor-nwse-resize rounded-full border-2 border-surface-lowest bg-primary [@media(pointer:coarse)]:-bottom-4 [@media(pointer:coarse)]:-right-4 [@media(pointer:coarse)]:size-8" />
              </div>
            </div>
            <p className="mt-2 text-xs text-on-surface-variant" id={`${id}-help`}>Drag the rectangle, drag its corner dot to resize, or type exact numbers. Percentages are of the photo width and height.</p>
          </div>
          <div className="grid grid-cols-2 gap-3 self-start">{num("x", "Left (%)")}{num("y", "Top (%)")}{num("w", "Width (%)")}{num("h", "Height (%)")}</div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------ Live price preview ---------------------------------- */
export function PricePreview({ config }: { config: ProductConfig }) {
  const first = config.quantityPresets?.[0] ?? config.minQuantity ?? 1;
  const [qty, setQty] = useState(String(first));
  const [pages, setPages] = useState("10");
  const [sel, setSel] = useState<Selections>({});
  const preview = useMemo(() => {
    try { return { r: computeLinePrice(config, sel, Number(qty), Number(pages)) }; }
    catch (e) { return { e: e instanceof PricingError ? e.message : "Invalid configuration" }; }
  }, [config, sel, qty, pages]);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Quantity">
          {config.quantityPresets?.length ? <Select value={qty} onChange={(e) => setQty(e.target.value)}>{config.quantityPresets.map((q) => <option key={q}>{q}</option>)}</Select>
            : <Input type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} data-testid="preview-qty" />}
        </Field>
        {config.perPage && <Field label="Pages"><Input type="number" min={1} value={pages} onChange={(e) => setPages(e.target.value)} /></Field>}
      </div>
      {config.optionGroups.map((g) => (
        <Field key={g.key} label={g.label}>
          <Select value={sel[g.key] ?? g.default ?? g.choices[0]?.value} onChange={(e) => setSel({ ...sel, [g.key]: e.target.value })}>
            {g.choices.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </Select>
        </Field>
      ))}
      {(config.personalisation?.fields ?? []).map((f) => (
        <Field key={f.key} label={`${f.label}${f.required ? " *" : ""}${f.flat ? ` (+${formatAED(f.flat)})` : ""}`}>
          {f.type === "textarea"
            ? <Textarea rows={2} maxLength={f.maxLength} value={sel[PERSONALISATION_PREFIX + f.key] ?? ""} onChange={(e) => setSel({ ...sel, [PERSONALISATION_PREFIX + f.key]: e.target.value })} />
            : <Input maxLength={f.maxLength} value={sel[PERSONALISATION_PREFIX + f.key] ?? ""} onChange={(e) => setSel({ ...sel, [PERSONALISATION_PREFIX + f.key]: e.target.value })} />}
        </Field>
      ))}
      {"e" in preview ? <Alert tone="yellow">{preview.e}</Alert> : (
        <div className="rounded-shape-md bg-surface-low p-4 text-sm tabular-nums" data-testid="price-preview">
          <div className="flex justify-between"><span>Unit price</span><span>{formatAED(preview.r!.unitPrice)}</span></div>
          <div className="flex justify-between"><span>Units</span><span>{preview.r!.units}</span></div>
          {preview.r!.setupFees > 0 && <div className="flex justify-between"><span>Setup / finishing</span><span>{formatAED(preview.r!.setupFees)}</span></div>}
          <div className="mt-2 flex justify-between border-t border-outline-variant pt-2 text-lg font-bold"><span>Line total</span><span data-testid="preview-total">{formatAED(preview.r!.lineTotal)}</span></div>
          <p className="mt-1 text-xs text-on-surface-variant">Excludes 5% VAT. This is exactly what customers are charged.</p>
        </div>
      )}
    </div>
  );
}

/* ------------------------------ Description helper ------------------------------------ */
export function DescribeButton({ name, category, config, onText }: { name: string; category: string; config: ProductConfig; onText: (t: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  async function go() {
    setBusy(true); setNote("");
    const res = await fetch("/api/v1/admin/products/describe", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, category: category || undefined, options: config.optionGroups.map((g) => g.label), personalised: !!(config.personalisation?.fields.length || (config.personalisation && config.personalisation.artwork !== "none")) }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setNote(data.error ?? "Could not write a description");
    onText(data.text); setNote(data.source === "ai" ? "AI draft. Please read and edit it before publishing." : "Draft from a template. Please edit it to match your product.");
  }
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button type="button" variant="outlined" size="sm" className="[@media(pointer:coarse)]:min-h-11" onClick={go} disabled={busy || name.trim().length < 2}>{busy ? "Writing…" : "Write description"}</Button>
      {note && <span className="text-xs text-on-surface-variant" role="status">{note}</span>}
    </div>
  );
}

