/**
 * Card rendering primitives (no "use client": usable by server components and by the editor).
 * Units: SVG user units = millimetres.
 */
import QRCode from "qrcode";
import type { CardDesign, CardElement, CardSide } from "@/lib/types";
import { fontStack, PT_MM } from "./fonts";

export const BLEED_MM = 2;
export const SAFE_MM = 4;

const qrCache = new Map<string, { size: number; path: string }>();
/** QR as a single SVG path in module units (sync, cached). */
export function qrPath(value: string) {
  const hit = qrCache.get(value);
  if (hit) return hit;
  const qr = QRCode.create(value || " ", { errorCorrectionLevel: "M" });
  const n = qr.modules.size;
  let d = "";
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.modules.get(r, c)) d += `M${c} ${r}h1v1h-1z`;
  const out = { size: n, path: d };
  if (qrCache.size > 200) qrCache.clear();
  qrCache.set(value, out);
  return out;
}

export function textGeometry(e: Extract<CardElement, { type: "text" }>) {
  const fsMm = e.fontSize * PT_MM;
  const lines = e.text.split("\n");
  const anchor: "start" | "middle" | "end" = e.align === "center" ? "middle" : e.align === "right" ? "end" : "start";
  const ax = e.align === "center" ? e.x + e.w / 2 : e.align === "right" ? e.x + e.w : e.x;
  const lineH = fsMm * 1.2;
  return { fsMm, lines, anchor, ax, lineH, height: lineH * lines.length, firstBaseline: e.y + fsMm * 0.85 };
}

/** Bounding box (mm) for selection outlines and hit areas. */
export function bbox(e: CardElement): { x: number; y: number; w: number; h: number } {
  switch (e.type) {
    case "text": { const g = textGeometry(e); return { x: e.x, y: e.y, w: e.w, h: g.height }; }
    case "circle": return { x: e.x - e.r, y: e.y - e.r, w: e.r * 2, h: e.r * 2 };
    case "line": return { x: Math.min(e.x, e.x + e.w), y: Math.min(e.y, e.y + e.h) - Math.max(e.thickness, 1) / 2, w: Math.max(Math.abs(e.w), 0.5), h: Math.max(Math.abs(e.h), e.thickness, 1) };
    case "qr": return { x: e.x, y: e.y, w: e.size, h: e.size };
    default: return { x: e.x, y: e.y, w: e.w, h: e.h };
  }
}

export function ElementSvg({ e }: { e: CardElement }) {
  switch (e.type) {
    case "text": {
      const g = textGeometry(e);
      return (
        <text x={g.ax} y={g.firstBaseline} fontSize={g.fsMm} fontFamily={fontStack(e.fontFamily)} fontWeight={e.fontWeight}
          fontStyle={e.italic ? "italic" : undefined} fill={e.color} textAnchor={g.anchor}
          letterSpacing={e.letterSpacing ? e.letterSpacing * 0.35 : undefined} style={{ whiteSpace: "pre" }}>
          {g.lines.map((l, i) => <tspan key={i} x={g.ax} dy={i === 0 ? 0 : g.lineH}>{l}</tspan>)}
        </text>
      );
    }
    case "rect": return <rect x={e.x} y={e.y} width={e.w} height={e.h} rx={e.radius} fill={e.fill} opacity={e.opacity} />;
    case "circle": return <circle cx={e.x} cy={e.y} r={e.r} fill={e.fill} opacity={e.opacity} />;
    case "line": return <line x1={e.x} y1={e.y} x2={e.x + e.w} y2={e.y + e.h} stroke={e.color} strokeWidth={e.thickness} strokeLinecap="round" />;
    case "image": return <image href={e.src} x={e.x} y={e.y} width={e.w} height={e.h} preserveAspectRatio={e.fit === "cover" ? "xMidYMid slice" : "xMidYMid meet"} />;
    case "qr": {
      const q = qrPath(e.value);
      const quiet = 1; // modules
      const scale = e.size / (q.size + quiet * 2);
      return (
        <g transform={`translate(${e.x} ${e.y}) scale(${scale})`}>
          <rect width={q.size + quiet * 2} height={q.size + quiet * 2} fill="#ffffff" />
          <path d={q.path} transform={`translate(${quiet} ${quiet})`} fill={e.color ?? "#000"} />
        </g>
      );
    }
  }
}

export function getSide(design: CardDesign, side: "front" | "back"): CardSide {
  return side === "back" ? design.back ?? { background: "#ffffff", elements: [] } : design.front;
}

/** Static SVG renderer (used for thumbnails in cart/admin and print proof). */
export function CardPreview({ design, side = "front", className, rounded = true }: { design: CardDesign; side?: "front" | "back"; className?: string; rounded?: boolean }) {
  const s = getSide(design, side);
  const id = `clip-${side}-${design.widthMm}-${design.heightMm}`;
  return (
    <svg viewBox={`0 0 ${design.widthMm} ${design.heightMm}`} className={className} role="img" aria-label={`Business card ${side}`}
      style={{ aspectRatio: `${design.widthMm} / ${design.heightMm}`, display: "block", width: "100%", height: "auto", borderRadius: rounded ? 6 : 0, boxShadow: "0 1px 3px rgb(0 0 0 / .15)" }}>
      <defs><clipPath id={id}><rect width={design.widthMm} height={design.heightMm} /></clipPath></defs>
      <g clipPath={`url(#${id})`}>
        <rect x={-BLEED_MM} y={-BLEED_MM} width={design.widthMm + 2 * BLEED_MM} height={design.heightMm + 2 * BLEED_MM} fill={s.background} />
        {s.elements.map((e) => <ElementSvg key={e.id} e={e} />)}
      </g>
    </svg>
  );
}

/* ---------- print-ready SVG string (server: download proof / send to RIP) ---------- */
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function elementString(e: CardElement): string {
  switch (e.type) {
    case "text": {
      const g = textGeometry(e);
      const spans = g.lines.map((l, i) => `<tspan x="${g.ax}" dy="${i === 0 ? 0 : g.lineH}">${esc(l)}</tspan>`).join("");
      return `<text x="${g.ax}" y="${g.firstBaseline}" font-size="${g.fsMm}" font-family="${esc(fontStack(e.fontFamily))}" font-weight="${e.fontWeight}"${e.italic ? ` font-style="italic"` : ""} fill="${esc(e.color)}" text-anchor="${g.anchor}"${e.letterSpacing ? ` letter-spacing="${e.letterSpacing * 0.35}"` : ""} xml:space="preserve">${spans}</text>`;
    }
    case "rect": return `<rect x="${e.x}" y="${e.y}" width="${e.w}" height="${e.h}"${e.radius ? ` rx="${e.radius}"` : ""} fill="${esc(e.fill)}"${e.opacity != null ? ` opacity="${e.opacity}"` : ""}/>`;
    case "circle": return `<circle cx="${e.x}" cy="${e.y}" r="${e.r}" fill="${esc(e.fill)}"${e.opacity != null ? ` opacity="${e.opacity}"` : ""}/>`;
    case "line": return `<line x1="${e.x}" y1="${e.y}" x2="${e.x + e.w}" y2="${e.y + e.h}" stroke="${esc(e.color)}" stroke-width="${e.thickness}" stroke-linecap="round"/>`;
    case "image": return `<image href="${esc(e.src)}" x="${e.x}" y="${e.y}" width="${e.w}" height="${e.h}" preserveAspectRatio="${e.fit === "cover" ? "xMidYMid slice" : "xMidYMid meet"}"/>`;
    case "qr": {
      const q = qrPath(e.value); const s = e.size / (q.size + 2);
      return `<g transform="translate(${e.x} ${e.y}) scale(${s})"><rect width="${q.size + 2}" height="${q.size + 2}" fill="#fff"/><path d="${q.path}" transform="translate(1 1)" fill="${esc(e.color ?? "#000")}"/></g>`;
    }
  }
}

/** Standalone SVG with 2 mm bleed and crop marks, sized in mm. */
export function cardSvgString(design: CardDesign, side: "front" | "back" = "front", opts: { bleed?: boolean; cropMarks?: boolean } = {}) {
  const s = getSide(design, side);
  const b = opts.bleed === false ? 0 : BLEED_MM;
  const m = opts.cropMarks ? 5 : 0;
  const W = design.widthMm, H = design.heightMm;
  const vbW = W + 2 * (b + m), vbH = H + 2 * (b + m);
  const marks = opts.cropMarks
    ? [[0, -b - m, 0, -b - 1], [W, -b - m, W, -b - 1], [0, H + b + 1, 0, H + b + m], [W, H + b + 1, W, H + b + m],
       [-b - m, 0, -b - 1, 0], [-b - m, H, -b - 1, H], [W + b + 1, 0, W + b + m, 0], [W + b + 1, H, W + b + m, H]]
        .map(([x1, y1, x2, y2]) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#000" stroke-width="0.15"/>`).join("")
    : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${vbW}mm" height="${vbH}mm" viewBox="${-(b + m)} ${-(b + m)} ${vbW} ${vbH}">
<defs><clipPath id="bleed"><rect x="${-b}" y="${-b}" width="${W + 2 * b}" height="${H + 2 * b}"/></clipPath></defs>
<g clip-path="url(#bleed)"><rect x="${-b}" y="${-b}" width="${W + 2 * b}" height="${H + 2 * b}" fill="${esc(s.background)}"/>${s.elements.map(elementString).join("")}</g>${marks}
</svg>`;
}
