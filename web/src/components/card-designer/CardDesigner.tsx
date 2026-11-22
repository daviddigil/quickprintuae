"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CardDesign, CardElement, CardSide } from "@/lib/types";
import { CARD_FONTS, GOOGLE_FONTS_URL } from "./fonts";
import { BLEED_MM, SAFE_MM, CardPreview, ElementSvg, bbox, getSide } from "./render";
import { blankDesign, templateDesigns, type CardDetails } from "./templates";

export { CardPreview } from "./render";

/**
 * Full business-card editor (front/back, text/shapes/logo/QR, drag to move) with an
 * "AI design" panel that POSTs to /api/v1/ai/business-card { store, details } -> { designs: CardDesign[] }.
 * Calls onChange on every edit. Storefront embeds it on the business card product page.
 */
export interface CardDesignerProps {
  store: string;               // tenant slug
  initial?: CardDesign;
  widthMm?: number;            // from selected card size
  heightMm?: number;
  doubleSided?: boolean;
  aiEnabled: boolean;
  onChange: (d: CardDesign) => void;
}

type SideKey = "front" | "back";
const uid = () => `el${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function useGoogleFonts() {
  useEffect(() => {
    if (document.querySelector(`link[data-card-fonts]`)) return;
    const l = document.createElement("link");
    l.rel = "stylesheet"; l.href = GOOGLE_FONTS_URL; l.dataset.cardFonts = "1";
    document.head.appendChild(l);
  }, []);
}

/** Scale all elements when the card size changes (e.g. customer picks Square). */
function resize(d: CardDesign, W: number, H: number): CardDesign {
  if (d.widthMm === W && d.heightMm === H) return d;
  const sx = W / d.widthMm, sy = H / d.heightMm, s = Math.min(sx, sy);
  const scaleEl = (e: CardElement): CardElement => {
    switch (e.type) {
      case "text": return { ...e, x: e.x * sx, y: e.y * sy, w: e.w * sx, fontSize: Math.max(5, e.fontSize * s) };
      case "circle": return { ...e, x: e.x * sx, y: e.y * sy, r: e.r * s };
      case "qr": return { ...e, x: e.x * sx, y: e.y * sy, size: e.size * s };
      case "line": return { ...e, x: e.x * sx, y: e.y * sy, w: e.w * sx, h: e.h * sy };
      default: return { ...e, x: e.x * sx, y: e.y * sy, w: e.w * sx, h: e.h * sy };
    }
  };
  const side = (sd?: CardSide) => sd && { ...sd, elements: sd.elements.map(scaleEl) };
  return { ...d, widthMm: W, heightMm: H, orientation: W >= H ? "landscape" : "portrait", front: side(d.front)!, back: side(d.back) };
}

async function fileToDataUrl(file: File, maxPx = 800): Promise<string> {
  const raw = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(file); });
  if (file.type === "image/svg+xml") return raw;
  const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = raw; });
  const k = Math.min(1, maxPx / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/png");
}

export function CardDesigner(p: CardDesignerProps) {
  useGoogleFonts();
  const W = p.widthMm ?? p.initial?.widthMm ?? 85;
  const H = p.heightMm ?? p.initial?.heightMm ?? 55;
  const [design, setDesign] = useState<CardDesign>(() => resize(p.initial ?? blankDesign(W, H), W, H));
  const [side, setSide] = useState<SideKey>("front");
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<"ai" | "edit">(p.initial ? "edit" : "ai");
  const [past, setPast] = useState<CardDesign[]>([]);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ id: string; sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null);

  // notify parent (ref avoids loops with inline callbacks)
  const onChangeRef = useRef(p.onChange);
  onChangeRef.current = p.onChange;
  useEffect(() => { onChangeRef.current(design); }, [design]);

  // follow size / sides from the product options
  useEffect(() => { setDesign((d) => resize(d, W, H)); }, [W, H]);
  useEffect(() => {
    if (p.doubleSided === false && side === "back") setSide("front");
    if (p.doubleSided && !design.back) setDesign((d) => ({ ...d, back: { background: "#ffffff", elements: [] } }));
  }, [p.doubleSided, side, design.back]);

  const current = getSide(design, side);
  const sel = current.elements.find((e) => e.id === selected) ?? null;

  const commit = useCallback((fn: (d: CardDesign) => CardDesign, history = true) => {
    setDesign((d) => { if (history) setPast((h) => [...h.slice(-30), d]); return fn(d); });
  }, []);
  const updateSide = useCallback((fn: (s: CardSide) => CardSide, history = true) => {
    commit((d) => side === "back" ? { ...d, back: fn(getSide(d, "back")) } : { ...d, front: fn(d.front) }, history);
  }, [commit, side]);
  const updateEl = useCallback((id: string, patch: Partial<CardElement>, history = true) => {
    updateSide((s) => ({ ...s, elements: s.elements.map((e) => (e.id === id ? ({ ...e, ...patch } as CardElement) : e)) }), history);
  }, [updateSide]);
  const add = (e: CardElement) => { updateSide((s) => ({ ...s, elements: [...s.elements, e] })); setSelected(e.id); setTab("edit"); };
  const remove = useCallback((id: string) => { updateSide((s) => ({ ...s, elements: s.elements.filter((e) => e.id !== id) })); setSelected(null); }, [updateSide]);
  const undo = useCallback(() => setPast((h) => { if (!h.length) return h; setDesign(h[h.length - 1]); return h.slice(0, -1); }), []);
  const reorder = (id: string, dir: 1 | -1) => updateSide((s) => {
    const i = s.elements.findIndex((e) => e.id === id); const j = i + dir;
    if (i < 0 || j < 0 || j >= s.elements.length) return s;
    const els = [...s.elements]; [els[i], els[j]] = [els[j], els[i]]; return { ...s, elements: els };
  });
  const duplicate = (e: CardElement) => add({ ...e, id: uid(), x: e.x + 2, y: e.y + 2 } as CardElement);

  /* ---------- pointer dragging in mm space ---------- */
  const toMm = (ev: { clientX: number; clientY: number }) => {
    const svg = svgRef.current!; const pt = svg.createSVGPoint();
    pt.x = ev.clientX; pt.y = ev.clientY;
    const m = svg.getScreenCTM(); if (!m) return { x: 0, y: 0 };
    const r = pt.matrixTransform(m.inverse()); return { x: r.x, y: r.y };
  };
  const onElDown = (ev: React.PointerEvent, e: CardElement) => {
    ev.stopPropagation(); (ev.target as Element).setPointerCapture?.(ev.pointerId);
    setSelected(e.id); setTab("edit");
    const m = toMm(ev);
    setPast((h) => [...h.slice(-30), design]);
    drag.current = { id: e.id, sx: m.x, sy: m.y, ox: e.x, oy: e.y, moved: false };
  };
  const onMove = (ev: React.PointerEvent) => {
    const d = drag.current; if (!d) return;
    const m = toMm(ev); const dx = m.x - d.sx, dy = m.y - d.sy;
    if (!d.moved && Math.hypot(dx, dy) < 0.3) return;
    d.moved = true;
    const snap = (v: number) => Math.round(v * 2) / 2; // 0.5 mm grid
    updateEl(d.id, { x: snap(d.ox + dx), y: snap(d.oy + dy) }, false);
  };
  const onUp = () => { if (drag.current && !drag.current.moved) setPast((h) => h.slice(0, -1)); drag.current = null; };

  /* ---------- keyboard ---------- */
  useEffect(() => {
    const k = (ev: KeyboardEvent) => {
      const t = ev.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable]")) return;
      if ((ev.metaKey || ev.ctrlKey) && ev.key === "z") { ev.preventDefault(); undo(); return; }
      if (!selected || !sel) return;
      if (ev.key === "Delete" || ev.key === "Backspace") { ev.preventDefault(); remove(selected); }
      const step = ev.shiftKey ? 2 : 0.5;
      const mv: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      if (mv[ev.key]) { ev.preventDefault(); updateEl(selected, { x: sel.x + mv[ev.key][0], y: sel.y + mv[ev.key][1] }); }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [selected, sel, remove, updateEl, undo]);

  const logoInput = useRef<HTMLInputElement>(null);
  const [qrValue, setQrValue] = useState("");

  const box = sel ? bbox(sel) : null;
  const bgId = `ed-clip-${side}`;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      {/* ---------- canvas ---------- */}
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {p.doubleSided !== false && (
            <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5 text-sm">
              {(["front", "back"] as const).map((s) => (
                <button key={s} type="button" onClick={() => { setSide(s); setSelected(null); }}
                  className={`rounded-md px-3 py-1 font-medium capitalize ${side === s ? "bg-slate-900 text-white" : "text-slate-600"}`}>{s}</button>
              ))}
            </div>
          )}
          <div className="ml-auto flex flex-wrap gap-1.5 text-sm">
            <ToolBtn onClick={() => add({ id: uid(), type: "text", x: SAFE_MM + 2, y: H / 2 - 3, w: W - 2 * SAFE_MM - 4, text: "Your text", fontSize: 10, fontFamily: "Montserrat", fontWeight: 600, color: "#111827", align: "left" })}>+ Text</ToolBtn>
            <ToolBtn onClick={() => add({ id: uid(), type: "rect", x: 0, y: 0, w: W / 3, h: H, fill: "#e11d48" })}>+ Box</ToolBtn>
            <ToolBtn onClick={() => add({ id: uid(), type: "circle", x: W - 12, y: 12, r: 8, fill: "#0f172a" })}>+ Circle</ToolBtn>
            <ToolBtn onClick={() => add({ id: uid(), type: "line", x: SAFE_MM + 2, y: H / 2, w: 20, h: 0, color: "#111827", thickness: 0.5 })}>+ Line</ToolBtn>
            <ToolBtn onClick={() => logoInput.current?.click()}>+ Logo</ToolBtn>
            <ToolBtn onClick={() => add({ id: uid(), type: "qr", x: W - SAFE_MM - 16, y: H - SAFE_MM - 16, size: 16, value: qrValue || "https://example.com", color: "#000000" })}>+ QR</ToolBtn>
            <ToolBtn onClick={undo} disabled={!past.length}>Undo</ToolBtn>
          </div>
          <input ref={logoInput} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden"
            onChange={async (ev) => {
              const f = ev.target.files?.[0]; ev.target.value = "";
              if (!f) return;
              if (f.size > 5_000_000) return alert("Logo must be under 5 MB");
              const src = await fileToDataUrl(f);
              if (src.length > 400_000) return alert("Logo is too detailed; please use a smaller PNG or SVG");
              add({ id: uid(), type: "image", x: SAFE_MM + 1, y: SAFE_MM + 1, w: 16, h: 16, src, fit: "contain" });
            }} />
        </div>

        <div className="rounded-xl bg-[repeating-conic-gradient(#f1f5f9_0%_25%,#fff_0%_50%)] bg-[length:16px_16px] p-4 sm:p-8">
          <svg ref={svgRef} viewBox={`${-BLEED_MM - 1} ${-BLEED_MM - 1} ${W + 2 * BLEED_MM + 2} ${H + 2 * BLEED_MM + 2}`}
            className="mx-auto block w-full max-w-[640px] touch-none select-none" style={{ aspectRatio: `${W + 2 * BLEED_MM + 2} / ${H + 2 * BLEED_MM + 2}` }}
            onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp} onPointerDown={() => setSelected(null)}>
            <defs><clipPath id={bgId}><rect x={-BLEED_MM} y={-BLEED_MM} width={W + 2 * BLEED_MM} height={H + 2 * BLEED_MM} /></clipPath></defs>
            <g clipPath={`url(#${bgId})`}>
              <rect x={-BLEED_MM} y={-BLEED_MM} width={W + 2 * BLEED_MM} height={H + 2 * BLEED_MM} fill={current.background} />
              {current.elements.map((e) => (
                <g key={e.id} onPointerDown={(ev) => onElDown(ev, e)} style={{ cursor: "move" }}>
                  <ElementSvg e={e} />
                  {/* generous transparent hit area for thin elements & text */}
                  {(() => { const b = bbox(e); return <rect x={b.x} y={b.y} width={b.w} height={b.h} fill="transparent" />; })()}
                </g>
              ))}
            </g>
            {/* guides: bleed (outer), trim (solid), safe (dashed) */}
            <rect x={-BLEED_MM} y={-BLEED_MM} width={W + 2 * BLEED_MM} height={H + 2 * BLEED_MM} fill="none" stroke="#f43f5e" strokeWidth={0.15} strokeDasharray="0.6 0.6" pointerEvents="none" />
            <rect x={0} y={0} width={W} height={H} fill="none" stroke="#0f172a" strokeOpacity={0.35} strokeWidth={0.2} pointerEvents="none" />
            <rect x={SAFE_MM} y={SAFE_MM} width={W - 2 * SAFE_MM} height={H - 2 * SAFE_MM} fill="none" stroke="#0ea5e9" strokeWidth={0.15} strokeDasharray="1 0.8" pointerEvents="none" />
            {box && <rect x={box.x - 0.6} y={box.y - 0.6} width={box.w + 1.2} height={box.h + 1.2} fill="none" stroke="#2563eb" strokeWidth={0.3} pointerEvents="none" />}
          </svg>
        </div>
        <p className="text-center text-xs text-slate-500">
          {W} × {H} mm · <span className="text-rose-500">red</span> = bleed (backgrounds extend here) · <span className="text-sky-500">blue</span> = safe area (keep text inside) · drag to move, arrows to nudge, Delete to remove
        </p>
      </div>

      {/* ---------- side panel ---------- */}
      <div className="space-y-3">
        <div className="inline-flex w-full rounded-lg border border-slate-300 bg-white p-0.5 text-sm">
          <button type="button" onClick={() => setTab("ai")} className={`flex-1 rounded-md px-3 py-1.5 font-medium ${tab === "ai" ? "bg-slate-900 text-white" : "text-slate-600"}`}>
            {p.aiEnabled ? "✨ AI design" : "Templates"}
          </button>
          <button type="button" onClick={() => setTab("edit")} className={`flex-1 rounded-md px-3 py-1.5 font-medium ${tab === "edit" ? "bg-slate-900 text-white" : "text-slate-600"}`}>Edit</button>
        </div>

        {tab === "ai" ? (
          <AiPanel store={p.store} aiEnabled={p.aiEnabled} W={W} H={H} doubleSided={p.doubleSided !== false}
            onQr={setQrValue}
            onPick={(d) => { commit(() => resize(d, W, H)); setSide("front"); setSelected(null); setTab("edit"); }} />
        ) : (
          <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 text-sm">
            <Row label={`${side === "front" ? "Front" : "Back"} background`}>
              <ColorInput value={current.background} onChange={(v) => updateSide((s) => ({ ...s, background: v }))} />
            </Row>
            {!sel && <p className="text-slate-500">Select an element on the card to edit it, or add one from the toolbar.</p>}
            {sel && (
              <>
                <div className="flex items-center justify-between border-t pt-3">
                  <span className="font-semibold capitalize">{sel.type === "qr" ? "QR code" : sel.type}</span>
                  <div className="flex gap-1">
                    <IconBtn title="Bring forward" onClick={() => reorder(sel.id, 1)}>↑</IconBtn>
                    <IconBtn title="Send backward" onClick={() => reorder(sel.id, -1)}>↓</IconBtn>
                    <IconBtn title="Duplicate" onClick={() => duplicate(sel)}>⧉</IconBtn>
                    <IconBtn title="Delete" onClick={() => remove(sel.id)} danger>✕</IconBtn>
                  </div>
                </div>
                <ElementProps el={sel} W={W} H={H} onChange={(patch) => updateEl(sel.id, patch)} />
              </>
            )}
            <div className="border-t pt-3">
              <p className="mb-1 text-xs font-medium text-slate-500">Layers</p>
              <ul className="max-h-40 space-y-0.5 overflow-auto">
                {[...current.elements].reverse().map((e) => (
                  <li key={e.id}>
                    <button type="button" onClick={() => setSelected(e.id)} className={`w-full truncate rounded px-2 py-1 text-left text-xs ${e.id === selected ? "bg-blue-50 text-blue-700" : "hover:bg-slate-50"}`}>
                      {e.type === "text" ? `T  ${e.text}` : e.type === "qr" ? "▦  QR code" : e.type === "image" ? "🖼  Logo" : e.type === "circle" ? "●  Circle" : e.type === "line" ? "—  Line" : "■  Box"}
                    </button>
                  </li>
                ))}
                {!current.elements.length && <li className="text-xs text-slate-400">Empty side</li>}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- AI / template panel ---------- */
function AiPanel({ store, aiEnabled, W, H, doubleSided, onPick, onQr }: {
  store: string; aiEnabled: boolean; W: number; H: number; doubleSided: boolean; onPick: (d: CardDesign) => void; onQr: (v: string) => void;
}) {
  const [details, setDetails] = useState<CardDetails>({ name: "", title: "", company: "", phone: "", email: "", website: "", address: "", industry: "", style: "modern" });
  const [colors, setColors] = useState<[string, string]>(["#e11d48", "#0f172a"]);
  const [useColors, setUseColors] = useState(false);
  const [designs, setDesigns] = useState<CardDesign[]>([]);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const logoRef = useRef<HTMLInputElement>(null);

  const set = (k: keyof CardDetails) => (ev: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setDetails((d) => ({ ...d, [k]: ev.target.value }));
  const clean = useMemo(() => {
    const out: CardDetails = { name: details.name.trim() };
    for (const k of ["title", "company", "phone", "email", "website", "address", "industry", "style", "logo"] as const) {
      const v = details[k]?.trim(); if (v) out[k] = v;
    }
    if (useColors) out.colors = colors;
    return out;
  }, [details, colors, useColors]);

  async function generate(ev: React.FormEvent) {
    ev.preventDefault();
    if (!clean.name) return setError("Enter at least your name");
    setError(null); setNote(null);
    if (clean.website) onQr(clean.website.startsWith("http") ? clean.website : `https://${clean.website}`);
    if (!aiEnabled) { setDesigns(templateDesigns(clean, { widthMm: W, heightMm: H, count: 6, doubleSided })); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/v1/ai/business-card", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ store, details: clean, widthMm: W, heightMm: H, doubleSided }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not generate designs");
      setDesigns(data.designs ?? []);
      if (data.note) setNote(data.note);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not generate designs");
      setDesigns(templateDesigns(clean, { widthMm: W, heightMm: H, count: 3, doubleSided }));
    } finally {
      setLoading(false);
    }
  }

  const inp = "w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-slate-500";
  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 text-sm">
      <form onSubmit={generate} className="space-y-2">
        <p className="text-slate-600">{aiEnabled ? "Tell us about you — AI creates 3 print-ready designs you can edit." : "Fill in your details and pick a template."}</p>
        <input className={inp} placeholder="Full name *" value={details.name} onChange={set("name")} required />
        <div className="grid grid-cols-2 gap-2">
          <input className={inp} placeholder="Job title" value={details.title} onChange={set("title")} />
          <input className={inp} placeholder="Company" value={details.company} onChange={set("company")} />
          <input className={inp} placeholder="Phone" value={details.phone} onChange={set("phone")} />
          <input className={inp} placeholder="Email" type="email" value={details.email} onChange={set("email")} />
          <input className={inp} placeholder="Website" value={details.website} onChange={set("website")} />
          <input className={inp} placeholder="Industry" value={details.industry} onChange={set("industry")} />
        </div>
        <input className={inp} placeholder="Address (optional)" value={details.address} onChange={set("address")} />
        <div className="grid grid-cols-2 gap-2">
          <select className={inp} value={details.style} onChange={set("style")}>
            {["modern", "minimal", "bold", "elegant", "corporate", "creative", "luxury"].map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
          </select>
          <button type="button" onClick={() => logoRef.current?.click()} className="truncate rounded-lg border border-dashed border-slate-300 px-2 py-1.5 text-slate-600 hover:bg-slate-50">
            {details.logo ? "✓ Logo added" : "Upload logo"}
          </button>
          <input ref={logoRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden"
            onChange={async (ev) => { const f = ev.target.files?.[0]; if (!f) return; const src = await fileToDataUrl(f, 600); if (src.length < 400_000) setDetails((d) => ({ ...d, logo: src })); }} />
        </div>
        <label className="flex items-center gap-2 text-slate-600">
          <input type="checkbox" checked={useColors} onChange={(e) => setUseColors(e.target.checked)} /> Use my brand colours
          {useColors && <>
            <input type="color" value={colors[0]} onChange={(e) => setColors([e.target.value, colors[1]])} className="h-6 w-8 cursor-pointer" />
            <input type="color" value={colors[1]} onChange={(e) => setColors([colors[0], e.target.value])} className="h-6 w-8 cursor-pointer" />
          </>}
        </label>
        {error && <p className="rounded bg-red-50 px-2 py-1 text-red-700">{error}</p>}
        <button disabled={loading} className="btn-store w-full rounded-lg px-4 py-2 font-semibold disabled:opacity-60">
          {loading ? "Designing… (10–30 s)" : aiEnabled ? "✨ Generate designs" : "Show templates"}
        </button>
      </form>

      {note && <p className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">{note}</p>}
      {loading && <div className="grid grid-cols-1 gap-2">{[0, 1, 2].map((i) => <div key={i} className="aspect-[85/55] animate-pulse rounded-md bg-slate-100" />)}</div>}
      {!loading && designs.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-slate-500">Click a design to edit it</p>
          {designs.map((d, i) => (
            <button key={i} type="button" onClick={() => onPick(d)} className="group block w-full rounded-lg border border-slate-200 p-2 text-left hover:border-slate-900">
              <div className="grid grid-cols-2 gap-2">
                <CardPreview design={d} side="front" />
                {d.back && <CardPreview design={d} side="back" />}
              </div>
              <p className="mt-1 text-xs text-slate-600 group-hover:text-slate-900">{d.name ?? `Design ${i + 1}`}</p>
            </button>
          ))}
        </div>
      )}
      <button type="button" className="w-full text-xs text-slate-500 underline" onClick={() => onPick(blankDesign(W, H))}>Start from a blank card</button>
    </div>
  );
}

/* ---------- property editors ---------- */
function ElementProps({ el, W, H, onChange }: { el: CardElement; W: number; H: number; onChange: (p: Partial<CardElement>) => void }) {
  const n = (k: string, v: number, min = -50, max = 200, step = 0.5) => (
    <NumInput key={k} label={k} value={v} min={min} max={max} step={step} onChange={(x) => onChange({ [k]: x } as Partial<CardElement>)} />
  );
  switch (el.type) {
    case "text":
      return (
        <div className="space-y-2">
          <textarea className="w-full rounded-lg border border-slate-300 px-2 py-1.5" rows={2} value={el.text} onChange={(e) => onChange({ text: e.target.value })} />
          <div className="grid grid-cols-2 gap-2">
            <select className="rounded-lg border border-slate-300 px-2 py-1.5" value={el.fontFamily} onChange={(e) => onChange({ fontFamily: e.target.value })} style={{ fontFamily: el.fontFamily }}>
              {CARD_FONTS.map((f) => <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>)}
            </select>
            <select className="rounded-lg border border-slate-300 px-2 py-1.5" value={el.fontWeight} onChange={(e) => onChange({ fontWeight: Number(e.target.value) as 400 })}>
              {[400, 500, 600, 700, 800].map((w) => <option key={w} value={w}>{({ 400: "Regular", 500: "Medium", 600: "Semibold", 700: "Bold", 800: "Extra bold" } as Record<number, string>)[w]}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <NumInput label="size pt" value={el.fontSize} min={4} max={40} step={0.5} onChange={(v) => onChange({ fontSize: v })} />
            <NumInput label="spacing" value={el.letterSpacing ?? 0} min={-1} max={4} step={0.1} onChange={(v) => onChange({ letterSpacing: v })} />
            <ColorInput value={el.color} onChange={(v) => onChange({ color: v })} />
          </div>
          <div className="flex gap-1">
            {(["left", "center", "right"] as const).map((a) => (
              <button key={a} type="button" onClick={() => onChange({ align: a })} className={`flex-1 rounded border px-2 py-1 text-xs capitalize ${el.align === a ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300"}`}>{a}</button>
            ))}
            <button type="button" onClick={() => onChange({ italic: !el.italic })} className={`rounded border px-2 py-1 text-xs italic ${el.italic ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300"}`}>I</button>
          </div>
          <div className="grid grid-cols-3 gap-2">{n("x", el.x, 0, W)}{n("y", el.y, 0, H)}{n("w", el.w, 5, W)}</div>
        </div>
      );
    case "rect":
      return (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">{n("x", el.x)}{n("y", el.y)}{n("w", el.w, 0.2)}{n("h", el.h, 0.2)}</div>
          <div className="grid grid-cols-3 gap-2"><ColorInput value={el.fill} onChange={(v) => onChange({ fill: v })} />{n("radius", el.radius ?? 0, 0, 30)}{n("opacity", el.opacity ?? 1, 0, 1, 0.05)}</div>
        </div>
      );
    case "circle":
      return <div className="grid grid-cols-2 gap-2">{n("x", el.x)}{n("y", el.y)}{n("r", el.r, 0.5)}<ColorInput value={el.fill} onChange={(v) => onChange({ fill: v })} />{n("opacity", el.opacity ?? 1, 0, 1, 0.05)}</div>;
    case "line":
      return <div className="grid grid-cols-2 gap-2">{n("x", el.x)}{n("y", el.y)}{n("w", el.w, -200)}{n("h", el.h, -200)}{n("thickness", el.thickness, 0.1, 5, 0.1)}<ColorInput value={el.color} onChange={(v) => onChange({ color: v })} /></div>;
    case "image":
      return <div className="grid grid-cols-2 gap-2">{n("x", el.x)}{n("y", el.y)}{n("w", el.w, 1)}{n("h", el.h, 1)}</div>;
    case "qr":
      return (
        <div className="space-y-2">
          <input className="w-full rounded-lg border border-slate-300 px-2 py-1.5" value={el.value} onChange={(e) => onChange({ value: e.target.value })} placeholder="https://your-site.ae" />
          <div className="grid grid-cols-2 gap-2">{n("x", el.x, 0, W)}{n("y", el.y, 0, H)}{n("size", el.size, 8, Math.min(W, H))}<ColorInput value={el.color ?? "#000000"} onChange={(v) => onChange({ color: v })} /></div>
        </div>
      );
  }
}

function NumInput({ label, value, onChange, min, max, step }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number }) {
  return (
    <label className="block">
      <span className="text-[11px] uppercase text-slate-400">{label}</span>
      <input type="number" className="w-full rounded-lg border border-slate-300 px-2 py-1" value={Math.round(value * 100) / 100} min={min} max={max} step={step}
        onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) onChange(v); }} />
    </label>
  );
}
function ColorInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const hex6 = /^#[0-9a-f]{6}$/i.test(value) ? value : /^#[0-9a-f]{8}$/i.test(value) ? value.slice(0, 7) : "#000000";
  return (
    <label className="block">
      <span className="text-[11px] uppercase text-slate-400">colour</span>
      <span className="flex items-center gap-1 rounded-lg border border-slate-300 px-1 py-0.5">
        <input type="color" value={hex6} onChange={(e) => onChange(e.target.value)} className="h-6 w-7 cursor-pointer border-0 bg-transparent p-0" />
        <input className="w-full min-w-0 text-xs outline-none" value={value} onChange={(e) => onChange(e.target.value)} />
      </span>
    </label>
  );
}
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-3"><span className="font-medium text-slate-700">{label}</span><div className="w-36">{children}</div></div>;
}
function ToolBtn(p: React.ComponentProps<"button">) {
  return <button type="button" {...p} className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40" />;
}
function IconBtn({ danger, ...p }: React.ComponentProps<"button"> & { danger?: boolean }) {
  return <button type="button" {...p} className={`h-7 w-7 rounded border text-xs ${danger ? "border-red-200 text-red-600 hover:bg-red-50" : "border-slate-300 hover:bg-slate-50"}`} />;
}
