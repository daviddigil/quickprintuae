"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Clock, ShieldCheck } from "lucide-react";
import { Alert, Button, Input, cn } from "@/components/ui";
import { CardDesigner } from "@/components/card-designer/CardDesigner";
import { addToCart } from "@/lib/cart";
import { computeLinePrice, formatAED } from "@/lib/pricing";
import type { CardDesign, OptionChoice, OptionGroup, ProductConfig, ProductKind, Selections } from "@/lib/types";
import { FileUploader, type UploadedFile } from "./file-uploader";

export interface ConfiguratorProduct {
  id: string; slug: string; name: string; kind: ProductKind; description: string; turnaroundHours: number; config: ProductConfig;
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
  const [cardTab, setCardTab] = useState<"ai" | "design" | "upload">(aiEnabled ? "ai" : "design");
  const [err, setErr] = useState<string | null>(null);

  const isPhotoMulti = kind === "photo";
  const effectiveQty = isPhotoMulti ? qty * Math.max(1, files.length) : qty;

  const price = useMemo(() => {
    try { return { ok: true as const, ...computeLinePrice(config, sel, effectiveQty, pages) }; }
    catch (e) { return { ok: false as const, error: (e as Error).message }; }
  }, [config, sel, effectiveQty, pages]);

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
      if (usingDesign && !design) return setErr("Create your design first (use the AI designer or the editor).");
      if (!usingDesign && !files.length) return setErr("Please upload your artwork.");
    } else if (config.requiresUpload && !files.length) {
      return setErr("Please upload your file first.");
    }
    if (!price.ok) return setErr(price.error);
    addToCart(store, {
      productId: product.id, productSlug: product.slug, productName: product.name, kind,
      quantity: effectiveQty, pages: config.perPage ? pages : 1, selections: sel,
      fileIds: usingDesign ? [] : files.map((f) => f.id), fileNames: usingDesign ? [] : files.map((f) => f.filename),
      design: usingDesign ? design : undefined, estimate: price.lineTotal,
    });
    router.push(`/s/${store}/cart`);
  }

  const uploader = (
    <FileUploader store={store} productId={product.id} accept={config.acceptedFiles} files={files} onChange={onFiles}
      multiple={kind === "photo" || kind === "document" || kind === "confidential_document"} confidential={kind === "confidential_document"} />
  );

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
      <div className="space-y-8">
        {/* Artwork / files */}
        {config.designer ? (
          <section>
            <h2 className="mb-3 font-semibold">Your design</h2>
            <div className="mb-4 inline-flex rounded-lg bg-slate-100 p-1 text-sm">
              {([aiEnabled ? ["ai", "AI design"] : null, ["design", "Design yourself"], ["upload", "Upload artwork"]].filter(Boolean) as [typeof cardTab, string][]).map(([k, l]) => (
                <button key={k} type="button" onClick={() => setCardTab(k)} className={cn("rounded-md px-3 py-1.5 font-medium", cardTab === k ? "bg-white shadow-sm" : "text-slate-600")}>{l}</button>
              ))}
            </div>
            {cardTab === "upload" ? uploader : (
              <CardDesigner key={cardTab} store={store} initial={design} widthMm={cardSize.w} heightMm={cardSize.h}
                doubleSided={sel.sides === "double"} aiEnabled={cardTab === "ai"} onChange={setDesign} />
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
            <label className="mb-1 block text-sm font-medium text-slate-700">{config.perPage ? "Copies" : isPhotoMulti ? "Copies of each photo" : "Quantity"}</label>
            {presets.length ? (
              <div className="flex flex-wrap gap-2">
                {presets.map((q) => (
                  <button key={q} type="button" onClick={() => setQty(q)} className={cn("rounded-lg border px-3 py-1.5 text-sm font-medium", qty === q ? "border-store bg-store-soft text-store" : "border-slate-300 hover:bg-slate-50")}>{q.toLocaleString()}</button>
                ))}
              </div>
            ) : (
              <Input type="number" min={config.minQuantity ?? 1} value={qty} name="quantity"
                onChange={(e) => setQty(Math.max(1, Math.floor(Number(e.target.value) || 1)))} />
            )}
            {config.minQuantity ? <p className="mt-1 text-xs text-slate-500">Minimum {config.minQuantity}</p> : null}
          </div>
          {config.perPage && (
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Pages per copy</label>
              <Input type="number" min={1} value={pages} name="pages" onChange={(e) => setPages(Math.max(1, Math.floor(Number(e.target.value) || 1)))} />
              <p className="mt-1 text-xs text-slate-500">Detected automatically from PDFs. The shop will confirm Word/other files.</p>
            </div>
          )}
        </section>
      </div>

      {/* Summary */}
      <aside className="lg:sticky lg:top-32 lg:self-start">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Your price</p>
          {price.ok ? (
            <>
              <p className="mt-1 text-3xl font-extrabold" data-testid="price">{formatAED(price.lineTotal)}</p>
              <p className="mt-1 text-xs text-slate-500">{pricesIncludeVat ? `incl. ${vatRate}% VAT` : `+ ${vatRate}% VAT at checkout`}</p>
              <dl className="mt-4 space-y-1 border-t border-slate-100 pt-3 text-sm">
                {Object.entries(price.labels).map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3"><dt className="text-slate-500">{config.optionGroups.find((g) => g.key === k)?.label}</dt><dd className="text-right font-medium">{v}</dd></div>
                ))}
                <div className="flex justify-between gap-3"><dt className="text-slate-500">{config.perPage ? "Pages × copies" : "Quantity"}</dt><dd className="font-medium">{config.perPage ? `${pages} × ${qty}` : effectiveQty.toLocaleString()}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-slate-500">Unit price</dt><dd className="font-medium">{formatAED(price.unitPrice)}</dd></div>
                {price.setupFees > 0 && <div className="flex justify-between gap-3"><dt className="text-slate-500">Setup / finishing</dt><dd className="font-medium">{formatAED(price.setupFees)}</dd></div>}
              </dl>
            </>
          ) : <p className="mt-2 text-sm text-red-600">{price.error}</p>}
          <p className="mt-4 flex items-center gap-2 text-sm text-slate-600"><Clock className="h-4 w-4" />Ready in ~{product.turnaroundHours < 24 ? `${product.turnaroundHours} hour${product.turnaroundHours > 1 ? "s" : ""}` : `${Math.round(product.turnaroundHours / 24)} day${product.turnaroundHours >= 48 ? "s" : ""}`}</p>
          {kind === "confidential_document" && <p className="mt-2 flex items-center gap-2 text-sm text-emerald-700"><ShieldCheck className="h-4 w-4" />Restricted access & sealed packaging</p>}
          {err && <div className="mt-4"><Alert>{err}</Alert></div>}
          <Button variant="store" className="mt-5 w-full py-3" onClick={add} disabled={!price.ok} data-testid="add-to-cart">Add to cart</Button>
        </div>
      </aside>
    </div>
  );
}

function OptionInput({ group, value, onChange }: { group: OptionGroup; value: string; onChange: (v: string) => void }) {
  const extra = (c: OptionChoice) =>
    c.flat ? `+${formatAED(c.flat)}` : c.addPerUnit ? `${c.addPerUnit > 0 ? "+" : "−"}${formatAED(Math.abs(c.addPerUnit))}/unit` : c.multiplier && c.multiplier !== 1 ? `×${c.multiplier}` : "";
  if (group.type === "radio" || group.choices.length <= 3) {
    return (
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-slate-700">{group.label}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {group.choices.map((c) => (
            <label key={c.value} className={cn("flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm", value === c.value ? "border-store bg-store-soft" : "border-slate-200 hover:border-slate-300")}>
              <input type="radio" name={group.key} value={c.value} checked={value === c.value} onChange={() => onChange(c.value)} className="sr-only" />
              <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded-full border", value === c.value ? "border-store btn-store" : "border-slate-300")}>{value === c.value && <Check className="h-3 w-3" />}</span>
              <span className="flex-1">{c.label}</span>
              {extra(c) && <span className="text-xs text-slate-500">{extra(c)}</span>}
            </label>
          ))}
        </div>
      </fieldset>
    );
  }
  return (
    <div>
      <label htmlFor={`opt-${group.key}`} className="mb-1 block text-sm font-medium text-slate-700">{group.label}</label>
      <select id={`opt-${group.key}`} name={group.key} value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-500">
        {group.choices.map((c) => <option key={c.value} value={c.value}>{c.label}{extra(c) ? `  (${extra(c)})` : ""}</option>)}
      </select>
    </div>
  );
}

function FrameSwatches({ group, value, onChange }: { group: OptionGroup; value: string; onChange: (v: string) => void }) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium text-slate-700">{group.label}</legend>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {group.choices.map((c) => {
          const st = FRAME_STYLE[c.value] ?? { border: "#334155" };
          return (
            <button key={c.value} type="button" onClick={() => onChange(c.value)} data-frame={c.value}
              className={cn("rounded-lg border p-2 text-left text-xs", value === c.value ? "border-store ring-2 ring-[var(--store)]/30" : "border-slate-200 hover:border-slate-300")}>
              <div className="mx-auto mb-2 aspect-[4/5] w-full bg-slate-200" style={{ border: `8px solid ${st.border}`, boxShadow: st.shadow }}>
                <div className={cn("h-full w-full", c.value === "canvas-wrap" ? "bg-gradient-to-br from-sky-300 to-indigo-400" : "bg-gradient-to-br from-slate-100 to-slate-300")} />
              </div>
              <span className="font-medium">{c.label}</span>
              {c.addPerUnit ? <span className="block text-slate-500">+{formatAED(c.addPerUnit)}</span> : null}
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
            : <div className="flex aspect-[4/5] w-full items-center justify-center bg-slate-100 text-xs text-slate-400">Your photo</div>}
        </div>
      </div>
    </div>
  );
}

function PassportGuide({ file, size }: { file?: UploadedFile; size: { w: number; h: number } | null }) {
  return (
    <div className="mt-6 grid gap-6 sm:grid-cols-[auto_1fr]">
      <div className="mx-auto w-36 overflow-hidden rounded border-2 border-dashed border-slate-300 bg-white" style={{ aspectRatio: size ? `${size.w} / ${size.h}` : "35 / 45" }}>
        {file?.previewUrl
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={file.previewUrl} alt="Preview" className="h-full w-full object-cover" />
          : <div className="flex h-full items-center justify-center text-xs text-slate-400">Photo</div>}
      </div>
      <div className="text-sm text-slate-600">
        {size && <p className="font-semibold text-slate-900">Print size: {size.w} × {size.h} mm</p>}
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
