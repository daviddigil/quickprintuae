"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Clock, ShieldCheck } from "lucide-react";
import { Alert, Button, Input, cn } from "@/components/ui";
import { CardDesigner } from "@/components/card-designer/CardDesigner";
import { addToCart } from "@/lib/cart";
import { computeLinePrice, formatAED } from "@/lib/pricing";
import { PERSONALISATION_PREFIX, type CardDesign, type OptionChoice, type OptionGroup, type PersonalisationField, type ProductConfig, type ProductKind, type Selections } from "@/lib/types";
import { activeTier, cleanSelections, estimateSelections, missingPersonalisation, personalisationLines, splitLabel, tierRows } from "@/lib/storefront-catalog";
import { FileUploader, type UploadedFile } from "./file-uploader";
import { ProductGallery } from "./ProductGallery";
import { QuoteRequestButton } from "./QuoteForm";

export interface ConfiguratorProduct {
  id: string; slug: string; name: string; kind: ProductKind; description: string; turnaroundHours: number; config: ProductConfig;
  /** photos, cover first */
  images?: string[];
}
export interface ConfiguratorInitial { selections?: Selections; quantity?: number; pages?: number }

const FRAME_STYLE: Record<string, { border: string; shadow?: string }> = {
  "black-classic": { border: "#111827" },
  "white-modern": { border: "#f8fafc", shadow: "inset 0 0 0 1px #e2e8f0" },
  "natural-oak": { border: "#c8a26b" },
  walnut: { border: "#5b3a24" },
  "gold-ornate": { border: "#c9a13b", shadow: "inset 0 0 0 3px #8a6a1f" },
  "silver-metal": { border: "#b6bcc4" },
  "floating-acrylic": { border: "rgba(226,232,240,0.6)", shadow: "0 0 0 1px #cbd5e1" },
  "canvas-wrap": { border: "transparent" },
};

function defaultSelections(config: ProductConfig, initial?: Selections): Selections {
  const s: Selections = {};
  for (const g of config.optionGroups) {
    const init = initial?.[g.key];
    s[g.key] = init && g.choices.some((c) => c.value === init) ? init : g.default ?? g.choices[0]?.value;
  }
  for (const f of config.personalisation?.fields ?? []) {
    const v = initial?.[PERSONALISATION_PREFIX + f.key];
    if (typeof v === "string" && v.trim()) s[PERSONALISATION_PREFIX + f.key] = v.slice(0, f.maxLength);
  }
  return s;
}

/** Physical size (mm) of the chosen print, from widthMm/heightMm or parsed from the label. */
function chosenSizeMm(config: ProductConfig, sel: Selections): { w: number; h: number } | null {
  for (const key of ["size", "spec", "paper_size"]) {
    const g = config.optionGroups.find((x) => x.key === key);
    const c = g?.choices.find((x) => x.value === sel[key]);
    if (!c) continue;
    if (c.widthMm && c.heightMm) return { w: c.widthMm, h: c.heightMm };
    const m = c.label.match(/(\d+(?:\.\d+)?)\s*×\s*(\d+(?:\.\d+)?)\s*(cm|mm)/);
    if (m) { const f = m[3] === "cm" ? 10 : 1; return { w: +m[1] * f, h: +m[2] * f }; }
  }
  return null;
}

function effectiveDpi(f: UploadedFile, mm: { w: number; h: number }) {
  if (!f.width || !f.height) return null;
  const [pl, ps] = [Math.max(f.width, f.height), Math.min(f.width, f.height)];
  const [ml, ms] = [Math.max(mm.w, mm.h), Math.min(mm.w, mm.h)];
  return Math.round(Math.min(pl / (ml / 25.4), ps / (ms / 25.4)));
}

export function Configurator({
  store, product, aiEnabled, vatRate, pricesIncludeVat, initial,
}: {
  store: string; product: ConfiguratorProduct; aiEnabled: boolean; vatRate: number; pricesIncludeVat: boolean; initial?: ConfiguratorInitial;
}) {
  const router = useRouter();
  const { config, kind } = product;
  const [sel, setSel] = useState<Selections>(() => defaultSelections(config, initial?.selections));
  const presets = config.quantityPresets ?? [];
  const [qty, setQty] = useState<number>(() => {
    const q = initial?.quantity;
    if (presets.length) return q && presets.includes(q) ? q : presets[0];
    return Math.max(q ?? 1, config.minQuantity ?? 1);
  });
  const [pages, setPages] = useState<number>(initial?.pages ?? 1);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [design, setDesign] = useState<CardDesign | undefined>();
  const [cardTab, setCardTab] = useState<"design" | "upload">("design");
  const [err, setErr] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);

  const pers = config.personalisation;
  const persFields = pers?.fields ?? [];
  // merchandise artwork upload (the print products keep their own upload / designer sections)
  const artworkMode = !config.designer && !config.requiresUpload ? (pers?.artwork ?? "none") : "none";
  const missing = missingPersonalisation(config, sel);
  const tiers = tierRows(config);

  const isPhotoMulti = kind === "photo";
  const effectiveQty = isPhotoMulti ? qty * Math.max(1, files.length) : qty;

  const price = useMemo(() => {
    try { return { ok: true as const, ...computeLinePrice(config, estimateSelections(config, sel), effectiveQty, pages) }; }
    catch (e) { return { ok: false as const, error: (e as Error).message }; }
  }, [config, sel, effectiveQty, pages]);

  // live preview on the cover photo: first uploaded artwork + first text field
  const artFile = artworkMode !== "none" ? files[0] : undefined;
  const firstText = persFields.find((f) => f.type === "text");
  const gallery = product.images ?? [];
  const previewProps = config.mockup?.enabled && (gallery.length > 0 || artworkMode !== "none" || firstText)
    ? { mockup: config.mockup, artworkUrl: artFile?.previewUrl ?? null, artworkName: artFile?.filename ?? null, artworkIsPlaceholder: !!artFile && !artFile.previewUrl, text: firstText ? sel[PERSONALISATION_PREFIX + firstText.key] ?? "" : "" }
    : null;
  const cleaned = cleanSelections(config, sel);

  const sizeMm = chosenSizeMm(config, sel);
  const checkDpi = ["photo", "photo_frame", "passport_photo"].includes(kind) && sizeMm;
  const lowRes = checkDpi ? files.map((f) => ({ f, dpi: effectiveDpi(f, sizeMm!) })).filter((x) => x.dpi != null && x.dpi < 300) : [];

  const cardSize = (() => {
    const c = config.optionGroups.find((g) => g.key === "card_size")?.choices.find((x) => x.value === sel.card_size);
    return { w: c?.widthMm ?? 85, h: c?.heightMm ?? 55 };
  })();

  function onFiles(next: UploadedFile[]) {
    setFiles(next);
    if (config.perPage) {
      const total = next.reduce((a, f) => a + (f.pageCount ?? 0), 0);
      if (total > 0) setPages(total);
    }
  }

  function add() {
    setErr(null);
    const usingDesign = config.designer && cardTab !== "upload";
    if (config.designer) {
      if (usingDesign && !design) return setErr("Create your design first (pick a template, use the AI designer or the editor).");
      if (!usingDesign && !files.length) return setErr("Please upload your artwork.");
    } else if (config.requiresUpload && !files.length) {
      return setErr("Please upload your file first.");
    }
    setAttempted(true);
    if (missing.length) {
      setErr(`Please fill in ${missing.map((f) => f.label).join(", ")}.`);
      document.getElementById(`pf-${missing[0].key}`)?.focus();
      return;
    }
    if (artworkMode === "required" && !files.length) return setErr("Please upload your artwork to continue.");
    if (!price.ok) return setErr(price.error);
    addToCart(store, {
      productId: product.id, productSlug: product.slug, productName: product.name, kind,
      details: personalisationLines(config, sel),
      quantity: effectiveQty, pages: config.perPage ? pages : 1, selections: cleaned,
      fileIds: usingDesign ? [] : files.map((f) => f.id), fileNames: usingDesign ? [] : files.map((f) => f.filename),
      design: usingDesign ? design : undefined, estimate: price.lineTotal,
    });
    router.push(`/s/${store}/cart`);
  }

  const uploader = (
    <FileUploader store={store} productId={product.id} accept={config.acceptedFiles ?? (artworkMode !== "none" ? ".png,.jpg,.jpeg,.svg,.pdf" : undefined)} files={files} onChange={onFiles}
      multiple={kind === "photo" || kind === "document" || kind === "confidential_document"} confidential={kind === "confidential_document"} />
  );

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
      <div className="min-w-0 space-y-8">
        {(gallery.length > 0 || previewProps) && <ProductGallery images={gallery} name={product.name} preview={previewProps} />}

        {/* Personalisation text */}
        {persFields.length > 0 && (
          <section aria-labelledby="pers-h">
            <h2 id="pers-h" className="mb-3 font-semibold">Personalise it</h2>
            <div className="space-y-4">
              {persFields.map((f) => (
                <PersonalisationInput key={f.key} field={f} value={sel[PERSONALISATION_PREFIX + f.key] ?? ""} invalid={attempted && missing.some((m) => m.key === f.key)}
                  onChange={(v) => setSel({ ...sel, [PERSONALISATION_PREFIX + f.key]: v })} />
              ))}
            </div>
          </section>
        )}

        {/* Merchandise artwork */}
        {artworkMode !== "none" && (
          <section aria-labelledby="art-h">
            <h2 id="art-h" className="mb-1 font-semibold">Your artwork {artworkMode === "required" ? <span className="text-sm font-normal text-on-surface-variant">(required)</span> : <span className="text-sm font-normal text-on-surface-variant">(optional)</span>}</h2>
            <p className="mb-3 text-sm text-on-surface-variant">{artworkMode === "required" ? "Upload the logo or design to print." : "Upload a logo or design, or skip this and add text only."} The preview above shows roughly where it will print.</p>
            {uploader}
          </section>
        )}

        {/* Artwork / files */}
        {config.designer ? (
          <section>
            <h2 className="mb-3 font-semibold">Your design</h2>
            <p className="mb-3 text-sm text-on-surface-variant">{aiEnabled ? "Pick a ready-made template or create with AI, then edit every detail." : "Pick a ready-made template, then edit every detail."}</p>
            <div className="mb-4 inline-flex rounded-lg bg-surface-container p-1 text-sm">
              {([["design", "Design online"], ["upload", "Upload artwork"]] as [typeof cardTab, string][]).map(([k, l]) => (
                <button key={k} type="button" onClick={() => setCardTab(k)} className={cn("min-h-11 rounded-md px-3 font-medium", cardTab === k ? "bg-white shadow-sm" : "text-on-surface-variant")}>{l}</button>
              ))}
            </div>
            {cardTab === "upload" ? uploader : (
              <CardDesigner key={cardTab} store={store} initial={design} widthMm={cardSize.w} heightMm={cardSize.h}
                doubleSided={sel.sides === "double"} aiEnabled={aiEnabled} onChange={setDesign} />
            )}
          </section>
        ) : config.requiresUpload ? (
          <section>
            <h2 className="mb-3 font-semibold">{kind === "photo" ? "Upload your photos" : kind === "passport_photo" ? "Upload a clear front-facing photo" : "Upload your file"}</h2>
            {uploader}
            {kind === "photo_frame" && <FramePreview file={files[0]} frame={sel.frame} mount={sel.mount} />}
            {kind === "passport_photo" && <PassportGuide file={files[0]} size={sizeMm} />}
          </section>
        ) : null}

        {lowRes.length > 0 && (
          <Alert tone={lowRes.some((x) => (x.dpi ?? 0) < 150) ? "red" : "yellow"}>
            <p className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" />Low resolution for this size</p>
            <ul className="mt-1 list-disc pl-5">
              {lowRes.map(({ f, dpi }) => <li key={f.id}>{f.filename}: about {dpi} dpi at this size (300 dpi recommended){(dpi ?? 0) < 150 ? " — will look blurry, choose a smaller size" : ""}.</li>)}
            </ul>
          </Alert>
        )}

        {/* Options */}
        <section className="space-y-5">
          <h2 className="font-semibold">Options</h2>
          {config.optionGroups.map((g) =>
            kind === "photo_frame" && g.key === "frame"
              ? <FrameSwatches key={g.key} group={g} value={sel[g.key]} onChange={(v) => setSel({ ...sel, [g.key]: v })} />
              : <OptionInput key={g.key} group={g} value={sel[g.key]} onChange={(v) => setSel({ ...sel, [g.key]: v })} />,
          )}
        </section>

        {/* Quantity */}
        <section className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-on-surface-variant">{config.perPage ? "Copies" : isPhotoMulti ? "Copies of each photo" : "Quantity"}</label>
            {presets.length ? (
              <div className="flex flex-wrap gap-2">
                {presets.map((q) => (
                  <button key={q} type="button" onClick={() => setQty(q)} className={cn("rounded-lg border px-3 py-1.5 text-sm font-medium", qty === q ? "border-store bg-store-soft text-store" : "border-outline-variant hover:bg-surface-low")}>{q.toLocaleString()}</button>
                ))}
              </div>
            ) : (
              <Input type="number" min={config.minQuantity ?? 1} value={qty} name="quantity"
                onChange={(e) => setQty(Math.max(1, Math.floor(Number(e.target.value) || 1)))} />
            )}
            {config.minQuantity ? <p className="mt-1 text-xs text-on-surface-variant">Minimum {config.minQuantity}</p> : null}
          </div>
          {config.perPage && (
            <div>
              <label className="mb-1 block text-sm font-medium text-on-surface-variant">Pages per copy</label>
              <Input type="number" min={1} value={pages} name="pages" onChange={(e) => setPages(Math.max(1, Math.floor(Number(e.target.value) || 1)))} />
              <p className="mt-1 text-xs text-on-surface-variant">Detected automatically from PDFs. The shop will confirm Word/other files.</p>
            </div>
          )}
        </section>

        {tiers.length > 0 && (
          <section aria-labelledby="tier-h" data-testid="tier-table">
            <h2 id="tier-h" className="mb-1 font-semibold">Buy more, save more</h2>
            <p className="mb-3 text-sm text-on-surface-variant">Price per unit before options{pricesIncludeVat ? "" : ", excl. VAT"}.</p>
            <div className="overflow-x-auto rounded-xl border border-outline-variant">
              <table className="w-full text-sm">
                <thead className="bg-surface-low text-start text-on-surface-variant">
                  <tr><th scope="col" className="px-3 py-2 text-start font-medium">Quantity</th><th scope="col" className="px-3 py-2 text-start font-medium">Each</th><th scope="col" className="px-3 py-2 text-start font-medium">You save</th></tr>
                </thead>
                <tbody>
                  {tiers.map((r) => {
                    const on = activeTier(tiers, effectiveQty) === r;
                    return (
                      <tr key={r.min} aria-current={on ? "true" : undefined} className={cn("border-t border-outline-variant", on && "bg-store-soft font-semibold")}>
                        <td className="px-3 py-2.5 tabular-nums">{r.max ? `${r.min.toLocaleString()}–${r.max.toLocaleString()}` : `${r.min.toLocaleString()}+`}</td>
                        <td className="px-3 py-2.5 tabular-nums">{formatAED(r.unitPrice)}</td>
                        <td className="px-3 py-2.5 tabular-nums">{r.savePct > 0 ? `${r.savePct}%` : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>

      {/* Summary */}
      <aside className="lg:sticky lg:top-32 lg:self-start">
        <div className="rounded-xl border border-outline-variant bg-white p-5 shadow-sm">
          <p className="text-sm text-on-surface-variant">Your price</p>
          {price.ok ? (
            <>
              <p className="mt-1 text-3xl font-extrabold" data-testid="price">{formatAED(price.lineTotal)}</p>
              <p className="mt-1 text-xs text-on-surface-variant">{pricesIncludeVat ? `incl. ${vatRate}% VAT` : `+ ${vatRate}% VAT at checkout`}</p>
              <dl className="mt-4 space-y-1 border-t border-outline-variant pt-3 text-sm">
                {Object.entries(price.labels).filter(([k]) => !k.startsWith(PERSONALISATION_PREFIX) || (sel[k] ?? "").trim()).map(([k, v]) => {
                  const [l, val] = k.startsWith(PERSONALISATION_PREFIX) ? splitLabel(k, v) : [config.optionGroups.find((g) => g.key === k)?.label, v];
                  return <div key={k} className="flex justify-between gap-3"><dt className="text-on-surface-variant">{l}</dt><dd className="min-w-0 break-words text-end font-medium">{val}</dd></div>;
                })}
                <div className="flex justify-between gap-3"><dt className="text-on-surface-variant">{config.perPage ? "Pages × copies" : "Quantity"}</dt><dd className="font-medium">{config.perPage ? `${pages} × ${qty}` : effectiveQty.toLocaleString()}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-on-surface-variant">Unit price</dt><dd className="font-medium">{formatAED(price.unitPrice)}</dd></div>
                {price.setupFees > 0 && <div className="flex justify-between gap-3"><dt className="text-on-surface-variant">Setup / finishing</dt><dd className="font-medium">{formatAED(price.setupFees)}</dd></div>}
              </dl>
            </>
          ) : <p className="mt-2 text-sm text-critical">{price.error}</p>}
          <p className="mt-4 flex items-center gap-2 text-sm text-on-surface-variant"><Clock className="h-4 w-4" />Ready in ~{product.turnaroundHours < 24 ? `${product.turnaroundHours} hour${product.turnaroundHours > 1 ? "s" : ""}` : `${Math.round(product.turnaroundHours / 24)} day${product.turnaroundHours >= 48 ? "s" : ""}`}</p>
          {kind === "confidential_document" && <p className="mt-2 flex items-center gap-2 text-sm text-success"><ShieldCheck className="h-4 w-4" />Restricted access & sealed packaging</p>}
          {err && <div className="mt-4"><Alert>{err}</Alert></div>}
          <Button variant="store" className="mt-5 w-full py-3" onClick={add} disabled={!price.ok} data-testid="add-to-cart">Add to cart</Button>
          {config.quote?.enabled && (
            <div className="mt-3 flex justify-center">
              <QuoteRequestButton store={store} product={{ id: product.id, name: product.name }} selections={cleaned} quantity={effectiveQty} label={config.quote.label} />
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

function PersonalisationInput({ field: f, value, onChange, invalid }: { field: PersonalisationField; value: string; onChange: (v: string) => void; invalid: boolean }) {
  const id = `pf-${f.key}`;
  const cls = cn("min-h-11 w-full rounded-lg border bg-white px-3 py-2.5 text-sm outline-none focus:border-outline", invalid ? "border-critical" : "border-outline-variant");
  const common = { id, name: id, value, maxLength: f.maxLength, placeholder: f.placeholder, "aria-required": f.required || undefined, "aria-invalid": invalid || undefined, "aria-describedby": `${id}-hint`, className: cls } as const;
  return (
    <div>
      <label htmlFor={id} className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 text-sm font-medium text-on-surface">
        <span>{f.label} {f.required ? <span className="font-normal text-critical">(required)</span> : <span className="font-normal text-on-surface-variant">(optional)</span>}</span>
        {f.flat ? <span className="text-xs font-normal text-on-surface-variant">+{formatAED(f.flat)} when filled in</span> : null}
      </label>
      {f.type === "textarea"
        ? <textarea {...common} rows={3} onChange={(e) => onChange(e.target.value)} />
        : <input {...common} type="text" autoComplete="off" onChange={(e) => onChange(e.target.value)} />}
      <p id={`${id}-hint`} className={cn("mt-1 flex justify-between gap-3 text-xs", invalid ? "text-critical" : "text-on-surface-variant")}>
        <span>{invalid ? `Please fill in ${f.label}.` : ""}</span>
        <span className="tabular-nums" data-testid={`${id}-count`}>{value.length}/{f.maxLength}</span>
      </p>
    </div>
  );
}

function OptionInput({ group, value, onChange }: { group: OptionGroup; value: string; onChange: (v: string) => void }) {
  const extra = (c: OptionChoice) =>
    c.flat ? `+${formatAED(c.flat)}` : c.addPerUnit ? `${c.addPerUnit > 0 ? "+" : "−"}${formatAED(Math.abs(c.addPerUnit))}/unit` : c.multiplier && c.multiplier !== 1 ? `×${c.multiplier}` : "";
  if (group.type === "radio" || group.choices.length <= 3) {
    return (
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-on-surface-variant">{group.label}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {group.choices.map((c) => (
            <label key={c.value} className={cn("flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm", value === c.value ? "border-store bg-store-soft" : "border-outline-variant hover:border-outline-variant")}>
              <input type="radio" name={group.key} value={c.value} checked={value === c.value} onChange={() => onChange(c.value)} className="sr-only" />
              <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded-full border", value === c.value ? "border-store btn-store" : "border-outline-variant")}>{value === c.value && <Check className="h-3 w-3" />}</span>
              <span className="flex-1">{c.label}</span>
              {extra(c) && <span className="text-xs text-on-surface-variant">{extra(c)}</span>}
            </label>
          ))}
        </div>
      </fieldset>
    );
  }
  return (
    <div>
      <label htmlFor={`opt-${group.key}`} className="mb-1 block text-sm font-medium text-on-surface-variant">{group.label}</label>
      <select id={`opt-${group.key}`} name={group.key} value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-outline-variant bg-white px-3 py-2.5 text-sm outline-none focus:border-outline">
        {group.choices.map((c) => <option key={c.value} value={c.value}>{c.label}{extra(c) ? `  (${extra(c)})` : ""}</option>)}
      </select>
    </div>
  );
}

function FrameSwatches({ group, value, onChange }: { group: OptionGroup; value: string; onChange: (v: string) => void }) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium text-on-surface-variant">{group.label}</legend>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {group.choices.map((c) => {
          const st = FRAME_STYLE[c.value] ?? { border: "#334155" };
          return (
            <button key={c.value} type="button" onClick={() => onChange(c.value)} data-frame={c.value}
              className={cn("rounded-lg border p-2 text-left text-xs", value === c.value ? "border-store ring-2 ring-[var(--store)]/30" : "border-outline-variant hover:border-outline-variant")}>
              <div className="mx-auto mb-2 aspect-[4/5] w-full bg-surface-high" style={{ border: `8px solid ${st.border}`, boxShadow: st.shadow }}>
                <div className={cn("h-full w-full", c.value === "canvas-wrap" ? "bg-gradient-to-br from-sky-300 to-indigo-400" : "bg-gradient-to-br from-slate-100 to-slate-300")} />
              </div>
              <span className="font-medium">{c.label}</span>
              {c.addPerUnit ? <span className="block text-on-surface-variant">+{formatAED(c.addPerUnit)}</span> : null}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function FramePreview({ file, frame, mount }: { file?: UploadedFile; frame: string; mount: string }) {
  const st = FRAME_STYLE[frame] ?? { border: "#111827" };
  return (
    <div className="mt-6 flex justify-center rounded-xl bg-[linear-gradient(#e7e5e4,#d6d3d1)] p-8">
      <div className="w-56 bg-white shadow-xl" style={{ border: frame === "canvas-wrap" ? "none" : `18px solid ${st.border}`, boxShadow: `${st.shadow ? st.shadow + "," : ""}0 20px 25px -5px rgb(0 0 0 / .25)` }}>
        <div style={{ padding: mount && mount !== "none" ? 18 : 0 }} className="bg-white">
          {file?.previewUrl
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={file.previewUrl} alt="Preview" className="block aspect-[4/5] w-full object-cover" />
            : <div className="flex aspect-[4/5] w-full items-center justify-center bg-surface-container text-xs text-outline">Your photo</div>}
        </div>
      </div>
    </div>
  );
}

function PassportGuide({ file, size }: { file?: UploadedFile; size: { w: number; h: number } | null }) {
  return (
    <div className="mt-6 grid gap-6 sm:grid-cols-[auto_1fr]">
      <div className="mx-auto w-36 overflow-hidden rounded border-2 border-dashed border-outline-variant bg-white" style={{ aspectRatio: size ? `${size.w} / ${size.h}` : "35 / 45" }}>
        {file?.previewUrl
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={file.previewUrl} alt="Preview" className="h-full w-full object-cover" />
          : <div className="flex h-full items-center justify-center text-xs text-outline">Photo</div>}
      </div>
      <div className="text-sm text-on-surface-variant">
        {size && <p className="font-semibold text-on-surface">Print size: {size.w} × {size.h} mm</p>}
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Face the camera, neutral expression, mouth closed</li>
          <li>Plain light background, even lighting, no shadows</li>
          <li>No glasses or headwear (religious headwear allowed if face is fully visible)</li>
          <li>We crop, resize and clean the background to the official spec</li>
        </ul>
      </div>
    </div>
  );
}
