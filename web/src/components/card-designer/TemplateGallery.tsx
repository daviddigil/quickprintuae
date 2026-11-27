"use client";
import { memo, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { FlipHorizontal2, Plus, Search, Sparkles } from "lucide-react";
import type { CardDesign } from "@/lib/types";
import { CARD_CATEGORIES, CARD_TEMPLATES, INDUSTRIES, buildDesign, fitsOrientation, scoreTemplate, type CardCategory, type CardTemplate, type IndustryKey } from "./catalog";
import { CardThumb } from "./CardThumb";
import { DetailsForm, SAMPLE_DETAILS, cleanDetails, type DetailsState } from "./details";
import { qrValue, type CardDetails } from "./kit";

export interface QuotaInfo { used: number; limit: number; remaining: number }

export interface PickInfo { sample: boolean; qr: string }

/** First tab of the card designer: ready-made templates filled live with the customer's details. Free, client-side, never counted against the AI allowance. */
export function TemplateGallery({ details, onDetails, W, H, doubleSided, aiEnabled, quota, onPick, onBlank, onAi }: {
  details: DetailsState; onDetails: (d: DetailsState) => void; W: number; H: number; doubleSided: boolean; aiEnabled: boolean;
  quota: QuotaInfo | null; onPick: (d: CardDesign, info: PickInfo) => void; onBlank: () => void; onAi: () => void;
}) {
  const [category, setCategory] = useState<CardCategory | "All">("All");
  const [industry, setIndustry] = useState<IndustryKey | "all">("all");
  const [query, setQuery] = useState("");
  const [shape, setShape] = useState<"fit" | "landscape" | "portrait" | "all">("fit");

  const clean = useMemo(() => cleanDetails(details), [details]);
  const sample = !clean.name;
  const shown: CardDetails = useMemo(() => (sample ? { ...SAMPLE_DETAILS, industry: clean.industry, colors: clean.colors, logo: clean.logo } : clean), [sample, clean]);
  const deferred = useDeferredValue(shown);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rank = { ...clean, style: undefined };
    return CARD_TEMPLATES
      .filter((t) => (shape === "fit" ? fitsOrientation(t, W, H) : shape === "all" ? true : t.orientation === "both" || t.orientation === shape))
      .filter((t) => category === "All" || t.category === category)
      .filter((t) => category !== "Industry" || industry === "all" || t.industry === industry)
      .filter((t) => !q || `${t.name} ${t.category} ${t.tags.join(" ")} ${INDUSTRIES.find((i) => i.key === t.industry)?.label ?? ""}`.toLowerCase().includes(q))
      .map((t, i) => ({ t, i, s: scoreTemplate(t, rank) }))
      .sort((a, b) => b.s - a.s || a.i - b.i)
      .map((x) => x.t);
  }, [category, industry, query, shape, W, H, clean]);

  const pick = (t: CardTemplate) => onPick(buildDesign(t, shown, W, H, true), { sample, qr: qrValue(shown) });
  const cardShape = H > W ? "portrait" : "landscape";
  const chip = (active: boolean) => `inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm font-medium ${active ? "border-on-surface bg-inverse-surface text-white" : "border-outline-variant bg-white text-on-surface hover:bg-surface-low"}`;

  return (
    <div className="space-y-5" data-testid="template-gallery">
      <details open className="rounded-xl border border-outline-variant bg-white p-4">
        <summary className="min-h-6 cursor-pointer text-sm font-semibold text-on-surface">Your details <span className="font-normal text-on-surface-variant">(fill them in once, every template updates)</span></summary>
        <div className="mt-3"><DetailsForm value={details} onChange={onDetails} idPrefix="tg" /></div>
      </details>

      {aiEnabled && <AiCta quota={quota} onAi={onAi} />}

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <label className="relative block min-w-0 flex-1 basis-56">
            <span className="sr-only">Search templates</span>
            <Search aria-hidden className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant" />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search templates (e.g. gold, QR, bakery)"
              className="h-11 w-full rounded-lg border border-outline-variant bg-white ps-9 pe-3 text-sm outline-none focus:border-on-surface focus-visible:ring-2 focus-visible:ring-primary/40" />
          </label>
          <label className="block">
            <span className="sr-only">Card shape</span>
            <select value={shape} onChange={(e) => setShape(e.target.value as typeof shape)} className="h-11 rounded-lg border border-outline-variant bg-white px-3 text-sm outline-none focus:border-on-surface">
              <option value="fit">Fits my card ({cardShape}, {W} x {H} mm)</option>
              <option value="landscape">Landscape</option>
              <option value="portrait">Portrait</option>
              <option value="all">All shapes</option>
            </select>
          </label>
        </div>
        <div role="group" aria-label="Template category" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:flex-wrap">
          {(["All", ...CARD_CATEGORIES] as const).map((c) => (
            <button key={c} type="button" aria-pressed={category === c} onClick={() => { setCategory(c); setIndustry("all"); }} className={chip(category === c)}>{c}</button>
          ))}
        </div>
        {category === "Industry" && (
          <div role="group" aria-label="Industry" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:flex-wrap">
            <button type="button" aria-pressed={industry === "all"} onClick={() => setIndustry("all")} className={chip(industry === "all")}>All industries</button>
            {INDUSTRIES.map((i) => <button key={i.key} type="button" aria-pressed={industry === i.key} onClick={() => setIndustry(i.key)} className={chip(industry === i.key)}>{i.label}</button>)}
          </div>
        )}
        <p className="text-sm text-on-surface-variant" aria-live="polite" data-testid="template-count">
          {list.length} template{list.length === 1 ? "" : "s"}. {sample ? "Showing sample text: type your name above to see your own card." : "Click a template to edit it, nothing is lost: you can change every text, logo and QR code."}
        </p>
      </div>

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3" data-testid="template-grid">
        <li>
          <button type="button" onClick={onBlank} data-testid="template-blank"
            className="flex h-full min-h-44 w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-outline bg-white p-3 text-on-surface-variant hover:border-on-surface hover:text-on-surface">
            <Plus aria-hidden className="h-6 w-6" />
            <span className="text-sm font-medium">Start blank</span>
            <span className="text-xs">Design it yourself</span>
          </button>
        </li>
        {list.map((t) => <TemplateTile key={t.id} t={t} details={deferred} W={W} H={H} doubleSided={doubleSided} onPick={pick} />)}
      </ul>
      {!list.length && <p className="rounded-xl border border-outline-variant bg-surface-low p-6 text-center text-sm text-on-surface-variant">No template matches. Try another category or clear the search.</p>}
    </div>
  );
}

function AiCta({ quota, onAi }: { quota: QuotaInfo | null; onAi: () => void }) {
  const out = quota?.remaining === 0;
  return (
    <section aria-label="Create with AI" data-testid="ai-cta" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-outline-variant bg-surface-low p-4">
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-on-surface">Want something unique? Create with AI</h3>
        <p className={`text-xs ${out ? "text-critical" : "text-on-surface-variant"}`}>
          {out ? `You have used all ${quota!.limit} AI designs this month. Templates and the editor are still free.` : quota ? `${quota.remaining} of ${quota.limit} left this month. Templates are free and never use your AI designs.` : "The AI designer makes 3 custom designs from your details."}
        </p>
      </div>
      <button type="button" onClick={onAi} disabled={out} data-testid="ai-cta-btn"
        className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-outline bg-white px-4 text-sm font-semibold text-on-surface hover:bg-surface-container disabled:cursor-not-allowed disabled:opacity-50">
        <Sparkles aria-hidden className="h-4 w-4" />
        Create with AI{quota && !out ? ` (${quota.remaining} of ${quota.limit} left this month)` : ""}
      </button>
    </section>
  );
}

const TemplateTile = memo(function TemplateTile({ t, details, W, H, doubleSided, onPick }: {
  t: CardTemplate; details: CardDetails; W: number; H: number; doubleSided: boolean; onPick: (t: CardTemplate) => void;
}) {
  const ref = useRef<HTMLLIElement>(null);
  const [visible, setVisible] = useState(false);
  const [hover, setHover] = useState(false);
  const [flipped, setFlipped] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || visible) return;
    if (typeof IntersectionObserver === "undefined") { setVisible(true); return; }
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setVisible(true); io.disconnect(); } }, { rootMargin: "300px" });
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);
  const design = useMemo(() => (visible ? buildDesign(t, details, W, H, doubleSided) : null), [visible, t, details, W, H, doubleSided]);
  const showBack = !!design?.back && (flipped || hover);
  const label = INDUSTRIES.find((i) => i.key === t.industry)?.label ?? t.category;
  return (
    <li ref={ref} data-testid="template-tile" data-template={t.id} className="overflow-hidden rounded-xl border border-outline-variant bg-white hover:border-on-surface focus-within:border-on-surface"
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} onFocus={() => setHover(true)} onBlur={() => setHover(false)}>
      <div className="relative p-2 pb-1">
        <span aria-hidden="true" className="relative block overflow-hidden rounded-md shadow-elev-1" style={{ aspectRatio: `${W} / ${H}` }}>
          {design ? (
            <>
              <CardThumb design={design} side="front" className={`transition-opacity duration-200 ${showBack ? "opacity-0" : "opacity-100"}`} />
              {design.back && <span className={`absolute inset-0 transition-opacity duration-200 ${showBack ? "opacity-100" : "opacity-0"}`}><CardThumb design={design} side="back" /></span>}
            </>
          ) : <span className="block h-full w-full animate-pulse bg-surface-container" />}
        </span>
        {/* the whole thumbnail is the button; it holds no text of its own, so the accessible name is the label */}
        <button type="button" onClick={() => onPick(t)} aria-label={`Use the ${t.name} template (${label})`} className="absolute inset-0 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-primary/50" />
      </div>
      <div className="flex items-center justify-between gap-1 ps-3 pe-1">
        <div className="min-w-0 py-1">
          <p className="truncate text-sm font-medium text-on-surface">{t.name}</p>
          <p className="truncate text-xs text-on-surface-variant">{label}{showBack ? " · back" : ""}</p>
        </div>
        {doubleSided && (
          <button type="button" aria-pressed={flipped} onClick={() => setFlipped((f) => !f)} aria-label={`Show the ${flipped ? "front" : "back"} of ${t.name}`} data-testid="template-flip"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container focus-visible:ring-2 focus-visible:ring-primary/50">
            <FlipHorizontal2 aria-hidden className="h-4 w-4" />
          </button>
        )}
      </div>
    </li>
  );
});
