"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import type { ProductConfig, ProductKind } from "@/lib/types";
import { Alert, Button, Card, CardHeader, Field, Input, Textarea } from "@/components/ui";
import { Switch } from "@/components/ui/switch";
import {
  DEFAULT_MOCKUP, DescribeButton, EMPTY_PERSONALISATION, MockupEditor, OptionGroupsEditor, PersonalisationEditor,
  PhotoManager, PricePreview, TierPricing, numOrUndef,
} from "./product-parts";

export interface EditableProduct {
  id: string; kind: ProductKind; name: string; slug: string; description: string; imageUrl: string;
  /** extra gallery photos (imageUrl is the cover) */
  images: string[]; category: string;
  /** owner-only; never sent to the storefront */
  internal: { costPrice?: number; note?: string };
  turnaroundHours: number; active: boolean; featured: boolean; sortOrder: number; config: ProductConfig;
}

export function ProductEditor({ product, storeSlug, categories = [] }: { product: EditableProduct; storeSlug: string; categories?: string[] }) {
  const router = useRouter();
  const [p, setP] = useState(product);
  const [photos, setPhotos] = useState<string[]>(() => [product.imageUrl, ...product.images].filter(Boolean));
  const [target, setTarget] = useState(50);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const cfg = p.config;
  const setCfg = (c: Partial<ProductConfig>) => setP((cur) => ({ ...cur, config: { ...cur.config, ...c } }));
  const pers = cfg.personalisation ?? EMPTY_PERSONALISATION;
  const suggestions = useMemo(() => [...new Set(categories)], [categories]);

  async function save() {
    setSaving(true); setMsg({});
    const body = { ...p, imageUrl: photos[0] ?? "", images: photos.slice(1) };
    const res = await fetch(`/api/v1/admin/products/${p.id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
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
        <div><Link href="/admin/products" className="inline-flex min-h-11 items-center text-sm text-on-surface-variant hover:underline">← Products</Link><h1 className="text-2xl font-bold">{p.name}</h1></div>
        <div className="flex flex-wrap gap-2">
          <a className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm text-on-surface-variant hover:underline" target="_blank" href={`/s/${storeSlug}/p/${p.slug}`}>View in store ↗</a>
          <Button variant="secondary" onClick={del}><Trash2 size={16} />Delete</Button>
          <Button onClick={save} disabled={saving} data-testid="save-product">{saving ? "Saving…" : "Save changes"}</Button>
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
              <Field label="Category" hint="groups your shop page">
                <Input list="editor-cats" value={p.category} placeholder="Mugs, Apparel, Gifts…" data-testid="e-category" onChange={(e) => setP({ ...p, category: e.target.value })} />
              </Field>
              <datalist id="editor-cats">{suggestions.map((c) => <option key={c} value={c} />)}</datalist>
              <Field label="Turnaround (hours)"><Input type="number" min={0} value={p.turnaroundHours} onChange={(e) => setP({ ...p, turnaroundHours: Number(e.target.value) || 0 })} /></Field>
              <div className="space-y-2 sm:col-span-2">
                <Field label="Description"><Textarea rows={3} value={p.description} onChange={(e) => setP({ ...p, description: e.target.value })} /></Field>
                <DescribeButton name={p.name} category={p.category} config={cfg} onText={(t) => setP((cur) => ({ ...cur, description: t }))} />
              </div>
              <Field label="Sort order"><Input type="number" value={p.sortOrder} onChange={(e) => setP({ ...p, sortOrder: Number(e.target.value) || 0 })} /></Field>
              <div className="flex flex-wrap items-end gap-4 text-sm">
                <Check label="Active (visible in your shop)" v={p.active} on={(v) => setP({ ...p, active: v })} />
                <Check label="Featured" v={p.featured} on={(v) => setP({ ...p, featured: v })} />
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Photos" subtitle="The first photo is the cover. Re-order, change the cover or remove photos." />
            <div className="p-5"><PhotoManager photos={photos} onChange={setPhotos} /></div>
          </Card>

          <Card>
            <CardHeader title="Pricing" subtitle="Unit price comes from the highest tier whose minimum is reached. Unit = one page for per-page products." />
            <div className="space-y-5 p-5">
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
              <TierPricing tiers={cfg.tiers} onTiers={(tiers) => setCfg({ tiers })}
                cost={p.internal.costPrice} onCost={(c) => setP((cur) => ({ ...cur, internal: { ...cur.internal, costPrice: c } }))} target={target} onTarget={setTarget} />
              <Field label="Private note" hint="only you and your staff see this">
                <Input value={p.internal.note ?? ""} maxLength={500} onChange={(e) => setP({ ...p, internal: { ...p.internal, note: e.target.value } })} data-testid="e-note" />
              </Field>
            </div>
          </Card>

          <Card>
            <CardHeader title="Options" subtitle="Sizes, colours, finishes. Each choice can add to the price, multiply it, or add a one-off fee." />
            <div className="p-5"><OptionGroupsEditor groups={cfg.optionGroups} onChange={(optionGroups) => setCfg({ optionGroups })} /></div>
          </Card>

          <Card>
            <CardHeader title="Personalisation" subtitle="Text and artwork customers add, with a live preview on your cover photo." />
            <div className="space-y-6 p-5">
              <PersonalisationEditor value={pers} onChange={(v) => setCfg({
                personalisation: v.fields.length || v.artwork !== "none" ? v : undefined,
                ...(v.artwork === "required" ? { requiresUpload: true } : pers.artwork === "required" ? { requiresUpload: false } : {}),
                ...(v.artwork !== "none" && !cfg.acceptedFiles ? { acceptedFiles: ".png,.jpg,.jpeg,.svg,.pdf" } : {}),
              })} />
              <div className="border-t border-outline-variant pt-5">
                <h4 className="mb-3 text-sm font-semibold">Print area on the photo</h4>
                <MockupEditor cover={photos[0]} value={cfg.mockup ?? DEFAULT_MOCKUP} onChange={(mockup) => setCfg({ mockup })} />
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Special requests" />
            <div className="p-5">
              <Switch checked={!!cfg.quote?.enabled} onChange={(enabled) => setCfg({ quote: { ...cfg.quote, enabled } })} label="Show a “Request a quote” button" hint="For bulk or special jobs. Customers send you a message instead of ordering." />
            </div>
          </Card>
        </div>

        <div>
          <Card className="sticky top-6">
            <CardHeader title="Live price preview" subtitle="Exactly what customers will be charged (excl. VAT)" />
            <div className="p-5"><PricePreview config={cfg} /></div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Check({ label, v, on }: { label: string; v: boolean; on: (v: boolean) => void }) {
  return <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm"><input type="checkbox" className="size-5" checked={v} onChange={(e) => on(e.target.checked)} />{label}</label>;
}
