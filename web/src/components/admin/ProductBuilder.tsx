"use client";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import type { MockupArea, OptionGroup, Personalisation, ProductConfig, ProductKind, QuantityTier } from "@/lib/types";
import { Alert, Button, Card, CardHeader, Field, Input, Select, Textarea } from "@/components/ui";
import { Switch } from "@/components/ui/switch";
import {
  DEFAULT_MOCKUP, DescribeButton, EMPTY_PERSONALISATION, MockupEditor, OptionGroupsEditor, PersonalisationEditor,
  PhotoManager, PricePreview, TierPricing, numOrUndef, slugify,
} from "./product-parts";

const STEPS = ["Basics", "Photos", "Pricing", "Options", "Personalise", "Review"] as const;
const KINDS: { value: ProductKind; label: string }[] = [
  { value: "merchandise", label: "Merchandise (mug, t-shirt, cap, keychain…)" },
  { value: "gift_pack", label: "Gift box or gift pack" },
  { value: "sticker", label: "Stickers and labels" },
  { value: "poster", label: "Posters and banners" },
  { value: "flyer", label: "Flyers and leaflets" },
  { value: "notebook", label: "Notebooks and stationery" },
  { value: "other", label: "Something else" },
];
const CATEGORY_SUGGESTIONS = ["Mugs", "Apparel", "Gifts", "Drinkware", "Accessories", "Stationery", "Home", "Corporate gifts"];
const ART = ".png,.jpg,.jpeg,.svg,.pdf";

export function ProductBuilder({ categories = [] }: { categories?: string[] }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [reached, setReached] = useState(0);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [kind, setKind] = useState<ProductKind>("merchandise");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [turnaround, setTurnaround] = useState(72);
  const [photos, setPhotos] = useState<string[]>([]);
  const [tiers, setTiers] = useState<QuantityTier[]>([{ min: 1, unitPrice: 29 }]);
  const [cost, setCost] = useState<number | undefined>();
  const [target, setTarget] = useState(50);
  const [note, setNote] = useState("");
  const [minQty, setMinQty] = useState<number | undefined>();
  const [groups, setGroups] = useState<OptionGroup[]>([]);
  const [pers, setPers] = useState<Personalisation>(EMPTY_PERSONALISATION);
  const [mockup, setMockup] = useState<MockupArea>(DEFAULT_MOCKUP);
  const [quote, setQuote] = useState(false);
  const [saving, setSaving] = useState<"draft" | "publish" | null>(null);
  const [error, setError] = useState("");
  const headingRef = useRef<HTMLHeadingElement>(null);

  const suggestions = useMemo(() => [...new Set([...categories, ...CATEGORY_SUGGESTIONS])], [categories]);
  const config: ProductConfig = useMemo(() => {
    const hasPers = pers.fields.length > 0 || pers.artwork !== "none";
    return {
      tiers, optionGroups: groups,
      ...(minQty ? { minQuantity: minQty } : {}),
      ...(hasPers ? { personalisation: pers } : {}),
      ...(mockup.enabled && photos.length ? { mockup } : {}),
      quote: { enabled: quote },
      requiresUpload: pers.artwork === "required",
      ...(pers.artwork !== "none" ? { acceptedFiles: ART } : {}),
    };
  }, [tiers, groups, minQty, pers, mockup, photos.length, quote]);

  function validate(s: number): string {
    if (s === 0 && name.trim().length < 2) return "Give your product a name (at least 2 characters).";
    if (s === 0 && !/^[a-z0-9-]+$/.test(slug || slugify(name))) return "The web address can only use lowercase letters, numbers and dashes.";
    if (s === 2 && (!tiers.length || tiers.some((t) => !(t.unitPrice >= 0)))) return "Add at least one price.";
    if (s === 2 && tiers.every((t) => t.unitPrice === 0)) return "Set a price above AED 0, or turn on 'Request a quote' in the last step.";
    if (s === 3 && new Set(groups.map((g) => g.key)).size !== groups.length) return "Option keys must be unique.";
    if (s === 4 && new Set(pers.fields.map((f) => f.key)).size !== pers.fields.length) return "Text field keys must be unique.";
    return "";
  }
  const go = (to: number) => { setError(""); setStep(to); setReached((r) => Math.max(r, to)); requestAnimationFrame(() => headingRef.current?.focus()); };
  const next = () => { const e = validate(step); if (e) return setError(e); go(Math.min(STEPS.length - 1, step + 1)); };

  async function save(publish: boolean) {
    for (let s = 0; s < STEPS.length; s++) { const e = validate(s); if (e) { setStep(s); return setError(e); } }
    setSaving(publish ? "publish" : "draft"); setError("");
    const body = {
      kind, name: name.trim(), slug: slug || slugify(name), description, category: category.trim() || null,
      imageUrl: photos[0] ?? "", images: photos.slice(1),
      internal: { ...(cost !== undefined ? { costPrice: cost } : {}), ...(note.trim() ? { note: note.trim() } : {}) },
      turnaroundHours: turnaround, active: publish, featured: false, sortOrder: 0, config,
    };
    const res = await fetch("/api/v1/admin/products", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    setSaving(null);
    if (!res.ok) return setError(data.error ?? "Could not save the product");
    router.push(`/admin/products?ok=${encodeURIComponent(publish ? `${name.trim()} is live in your shop` : `${name.trim()} saved as a draft`)}`);
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-2"><Link href="/admin/products" className="inline-flex min-h-11 items-center text-sm text-on-surface-variant hover:underline">← Products</Link></div>
      <h1 className="text-2xl font-bold">Build a product</h1>
      <p className="mb-5 mt-1 text-sm text-on-surface-variant">Six quick steps. You can save a draft at any point from the last step and finish later.</p>

      <nav aria-label="Progress" className="mb-6">
        <ol className="flex gap-1 overflow-x-auto pb-1 [scrollbar-width:none]">
          {STEPS.map((label, i) => {
            const done = i < step, current = i === step, can = i <= reached;
            return (
              <li key={label} className="min-w-0 flex-1">
                <button type="button" disabled={!can} onClick={() => can && go(i)} aria-current={current ? "step" : undefined} data-testid={`step-${i + 1}`}
                  className={`flex min-h-11 w-full items-center justify-center gap-2 rounded-shape-md px-2 text-sm font-semibold transition-colors ${current ? "bg-primary text-on-primary" : done ? "bg-secondary-container text-on-secondary-container" : "bg-surface-container text-on-surface-variant"} disabled:cursor-not-allowed disabled:opacity-60`}>
                  <span aria-hidden className="grid size-5 shrink-0 place-items-center rounded-full border border-current text-xs">{done ? <Check size={12} /> : i + 1}</span>
                  <span className="hidden sm:inline">{label}</span><span className="sr-only sm:hidden">{label}</span>
                </button>
              </li>
            );
          })}
        </ol>
        <p className="mt-2 text-sm text-on-surface-variant sm:hidden" aria-hidden>Step {step + 1} of {STEPS.length}: {STEPS[step]}</p>
      </nav>

      {error && <div className="mb-4"><Alert>{error}</Alert></div>}

      <Card>
        {step === 0 && (
          <>
            <CardHeader title={<span ref={headingRef} tabIndex={-1} className="outline-none">1. What are you selling?</span>} subtitle="Name it the way customers search for it." />
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <Field label="Product name"><Input value={name} placeholder="Printed Mug" autoFocus data-testid="b-name" onChange={(e) => { setName(e.target.value); if (!slugTouched) setSlug(slugify(e.target.value)); }} /></Field>
              <Field label="Web address" hint="/p/…"><Input value={slug} onChange={(e) => { setSlugTouched(true); setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-")); }} /></Field>
              <Field label="Type"><Select value={kind} onChange={(e) => setKind(e.target.value as ProductKind)} data-testid="b-kind">{KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}</Select></Field>
              <Field label="Category" hint="groups your shop page">
                <Input list="cat-suggestions" value={category} placeholder="Mugs, Apparel, Gifts…" onChange={(e) => setCategory(e.target.value)} data-testid="b-category" />
              </Field>
              <datalist id="cat-suggestions">{suggestions.map((c) => <option key={c} value={c} />)}</datalist>
              <div className="sm:col-span-2 space-y-2">
                <Field label="Description"><Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
                <DescribeButton name={name} category={category} config={config} onText={setDescription} />
              </div>
              <Field label="Typical turnaround (hours)"><Input type="number" min={0} value={turnaround} onChange={(e) => setTurnaround(Math.max(0, Number(e.target.value) || 0))} /></Field>
            </div>
          </>
        )}
        {step === 1 && (
          <>
            <CardHeader title={<span ref={headingRef} tabIndex={-1} className="outline-none">2. Photos</span>} subtitle="The first photo is the cover. Re-order with the arrows." />
            <div className="p-5"><PhotoManager photos={photos} onChange={setPhotos} /></div>
          </>
        )}
        {step === 2 && (
          <>
            <CardHeader title={<span ref={headingRef} tabIndex={-1} className="outline-none">3. Pricing</span>} subtitle="Your prices, excluding 5% VAT. Starter numbers are only a guess: set your own." />
            <div className="space-y-5 p-5">
              <TierPricing tiers={tiers} onTiers={setTiers} cost={cost} onCost={setCost} target={target} onTarget={setTarget} />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Minimum order quantity" hint="optional"><Input type="number" min={1} value={minQty ?? ""} onChange={(e) => setMinQty(numOrUndef(e.target.value))} /></Field>
                <Field label="Private note" hint="only you see this"><Input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="Supplier, SKU, reorder link…" /></Field>
              </div>
            </div>
          </>
        )}
        {step === 3 && (
          <>
            <CardHeader title={<span ref={headingRef} tabIndex={-1} className="outline-none">4. Options</span>} subtitle="Sizes, colours, materials. Each choice can add to the price, multiply it, or add a one-off fee." />
            <div className="p-5"><OptionGroupsEditor groups={groups} onChange={setGroups} /></div>
          </>
        )}
        {step === 4 && (
          <>
            <CardHeader title={<span ref={headingRef} tabIndex={-1} className="outline-none">5. Personalisation</span>} subtitle="Let customers add their own text and artwork, with a live preview on your photo." />
            <div className="space-y-6 p-5">
              <PersonalisationEditor value={pers} onChange={setPers} />
              <div className="border-t border-outline-variant pt-5">
                <h4 className="mb-3 text-sm font-semibold">Print area on the photo</h4>
                <MockupEditor cover={photos[0]} value={mockup} onChange={setMockup} />
              </div>
            </div>
          </>
        )}
        {step === 5 && (
          <>
            <CardHeader title={<span ref={headingRef} tabIndex={-1} className="outline-none">6. Review and publish</span>} subtitle="Check the price the way a customer will see it." />
            <div className="grid gap-6 p-5 lg:grid-cols-2">
              <div className="space-y-4">
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                  <dt className="text-on-surface-variant">Name</dt><dd className="font-medium">{name}</dd>
                  <dt className="text-on-surface-variant">Category</dt><dd>{category || "None"}</dd>
                  <dt className="text-on-surface-variant">Photos</dt><dd>{photos.length}</dd>
                  <dt className="text-on-surface-variant">Price tiers</dt><dd>{tiers.length}</dd>
                  <dt className="text-on-surface-variant">Options</dt><dd>{groups.length ? groups.map((g) => g.label).join(", ") : "None"}</dd>
                  <dt className="text-on-surface-variant">Personalisation</dt><dd>{pers.fields.length} text field{pers.fields.length === 1 ? "" : "s"}, artwork {pers.artwork}</dd>
                  <dt className="text-on-surface-variant">Print area</dt><dd>{config.mockup ? "Set" : "Not set"}</dd>
                </dl>
                <Switch checked={quote} onChange={setQuote} label="Show a “Request a quote” button" hint="For bulk or special jobs. Customers send you a message instead of ordering." />
              </div>
              <div><h4 className="mb-2 text-sm font-semibold">Live price preview</h4><PricePreview config={config} /></div>
            </div>
          </>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-outline-variant/70 px-5 py-4">
          <Button type="button" variant="text" onClick={() => go(Math.max(0, step - 1))} disabled={step === 0}>Back</Button>
          {step < STEPS.length - 1 ? (
            <Button type="button" onClick={next} data-testid="b-next">Next: {STEPS[step + 1]}</Button>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="tonal" onClick={() => save(false)} disabled={!!saving} data-testid="b-draft">{saving === "draft" ? "Saving…" : "Save as draft"}</Button>
              <Button type="button" onClick={() => save(true)} disabled={!!saving} data-testid="b-publish">{saving === "publish" ? "Publishing…" : "Publish"}</Button>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
