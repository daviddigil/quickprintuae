/**
 * Shared, pure building blocks for the business-card templates (client and server safe):
 * details/palette types, colour maths (WCAG contrast), text measuring/wrapping and the `Sb` side builder
 * that the catalogue layouts are written with.
 */
import type { CardElement, CardSide } from "@/lib/types";
import { PT_MM } from "./fonts";

export interface CardDetails {
  name: string;
  title?: string;
  company?: string;
  phone?: string;
  email?: string;
  website?: string;
  address?: string;
  industry?: string;
  style?: string;
  colors?: string[];
  logo?: string; // data URL
}

export interface Palette { primary: string; secondary: string; ink: string; muted: string; light: string }

const INDUSTRY_PALETTES: [RegExp, Palette][] = [
  [/(law|legal|finance|bank|account|consult|insur)/i, { primary: "#0f2a4a", secondary: "#c9a227", ink: "#111827", muted: "#4b5563", light: "#f8fafc" }],
  [/(health|clinic|medical|dental|pharma|care)/i, { primary: "#0e7490", secondary: "#22c55e", ink: "#0f172a", muted: "#475569", light: "#f0fdfa" }],
  [/(tech|software|it |digital|ai|startup|app)/i, { primary: "#4f46e5", secondary: "#06b6d4", ink: "#0f172a", muted: "#64748b", light: "#f5f3ff" }],
  [/(real estate|property|construct|architect|interior)/i, { primary: "#1f2937", secondary: "#b45309", ink: "#111827", muted: "#6b7280", light: "#fafaf9" }],
  [/(food|restaurant|cafe|coffee|bakery|catering)/i, { primary: "#9a3412", secondary: "#f59e0b", ink: "#1c1917", muted: "#57534e", light: "#fffbeb" }],
  [/(beauty|salon|spa|fashion|boutique|wedding|event)/i, { primary: "#9d174d", secondary: "#f9a8d4", ink: "#1f2937", muted: "#6b7280", light: "#fdf2f8" }],
  [/(auto|car|garage|logistic|transport|cargo)/i, { primary: "#b91c1c", secondary: "#111827", ink: "#111827", muted: "#4b5563", light: "#f9fafb" }],
];
const DEFAULT_PALETTE: Palette = { primary: "#e11d48", secondary: "#0f172a", ink: "#0f172a", muted: "#64748b", light: "#fff1f2" };

export const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
export function paletteFor(d: CardDetails): Palette {
  const base = INDUSTRY_PALETTES.find(([re]) => re.test(`${d.industry ?? ""} ${d.company ?? ""} ${d.title ?? ""}`))?.[1] ?? DEFAULT_PALETTE;
  const [p, s] = (d.colors ?? []).filter((c) => HEX.test(c));
  return { ...base, primary: p ?? base.primary, secondary: s ?? base.secondary };
}

/** Shrink font size so an estimated text width fits inside w (mm). */
export function fitFont(text: string, fontSize: number, w: number, min = 5) {
  const est = (fs: number) => text.length * fs * PT_MM * 0.56;
  let fs = fontSize;
  while (fs > min && est(fs) > w) fs -= 0.5;
  return fs;
}

/** Shapes touching the trim edge are extended into the bleed so no white slivers appear after cutting. */
export function bleedify(side: CardSide, W: number, H: number, b = 2): CardSide {
  return {
    ...side,
    elements: side.elements.map((e) => {
      if (e.type !== "rect") return e;
      let { x, y, w, h } = e;
      if (x <= 0.01) { w += b + x; x = -b; }
      if (y <= 0.01) { h += b + y; y = -b; }
      if (x + w >= W - 0.01) w = W + b - x;
      if (y + h >= H - 0.01) h = H + b - y;
      return { ...e, x, y, w, h };
    }),
  };
}

/* ---------------------------------------------------------------- colour maths */
export function hexRgb(h: string): [number, number, number] {
  let s = h.replace("#", "");
  if (s.length === 3 || s.length === 4) s = s.split("").map((c) => c + c).join("");
  const n = parseInt(s.slice(0, 6), 16);
  return Number.isFinite(n) ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : [0, 0, 0];
}
export const rgbHex = ([r, g, b]: [number, number, number]) =>
  "#" + [r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("");
export function lum(h: string): number {
  const [r, g, b] = hexRgb(h).map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a: string, b: string): number {
  const [x, y] = [lum(a), lum(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
export function mix(a: string, b: string, t: number): string {
  const [p, q] = [hexRgb(a), hexRgb(b)];
  return rgbHex([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t]);
}
export const tint = (c: string, t: number) => mix(c, "#ffffff", t);
export const shade = (c: string, t: number) => mix(c, "#000000", t);
export const isDark = (c: string) => lum(c) < 0.18;
/** A dark version of a colour (for dark backgrounds), keeping its hue. */
export function deep(c: string, maxLum = 0.07): string {
  let out = c;
  for (let t = 0; t <= 1 && lum(out) > maxLum; t += 0.05) out = shade(c, t);
  return out;
}
/** A light version of a colour (for pale backgrounds). */
export function pale(c: string, minLum = 0.8): string {
  let out = c;
  for (let t = 0; t <= 1 && lum(out) < minLum; t += 0.05) out = tint(c, t);
  return out;
}
/** Black or white, whichever reads better on bg. */
export const onColor = (bg: string) => (contrast("#ffffff", bg) >= contrast("#111111", bg) ? "#ffffff" : "#111111");
/** `pref` if it reads on bg (WCAG AA), otherwise the nearest shade of it that does. */
export function readable(pref: string, bg: string, min = 4.5): string {
  if (contrast(pref, bg) >= min) return pref;
  const target = contrast("#ffffff", bg) >= contrast("#000000", bg) ? "#ffffff" : "#000000";
  for (let t = 0.1; t <= 1.0001; t += 0.1) { const c = mix(pref, target, t); if (contrast(c, bg) >= min) return c; }
  return target;
}

/* ---------------------------------------------------------------- text */
export type Weight = 400 | 500 | 600 | 700 | 800;
export interface TextOpts {
  font?: string; weight?: Weight; color?: string; on?: string; align?: "left" | "center" | "right";
  ls?: number; italic?: boolean; upper?: boolean; maxLines?: number; fixed?: boolean;
}
export const MIN_PT = 6;
const ARABIC = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/;
export const isArabic = (s: string) => ARABIC.test(s);

function charEm(font: string, weight: number, upper: boolean, digits: boolean) {
  let e = font === "Oswald" ? 0.46 : /Montserrat|Poppins/.test(font) ? 0.6 : /Cairo|Tajawal/.test(font) ? 0.52 : /Playfair/.test(font) ? 0.56 : 0.55;
  if (weight >= 700) e += 0.04; else if (weight >= 600) e += 0.02;
  if (upper) e += font === "Oswald" ? 0.06 : 0.11;
  if (digits) e += 0.03;
  return e * 1.03;
}
function textWidth(s: string, fs: number, font: string, weight: number, ls: number, upper: boolean) {
  const digits = /\d{4,}/.test(s);
  return s.length * (fs * PT_MM * charEm(font, weight, upper, digits) + ls * 0.35);
}
function wrapLines(str: string, w: number, meas: (s: string) => number): string[] {
  const lines: string[] = []; let cur = "";
  for (const word of str.split(" ").filter(Boolean)) {
    let wd = word;
    while (meas(wd) > w && wd.length > 1) {
      let n = wd.length; while (n > 1 && meas(wd.slice(0, n)) > w) n--;
      if (cur) { lines.push(cur); cur = ""; }
      lines.push(wd.slice(0, n)); wd = wd.slice(n);
    }
    if (!wd) continue;
    const next = cur ? `${cur} ${wd}` : wd;
    if (!cur || meas(next) <= w) cur = next; else { lines.push(cur); cur = wd; }
  }
  if (cur) lines.push(cur);
  return lines;
}

export interface TextLayout { lines: string[]; fs: number; font: string; weight: Weight; ls: number; align: "left" | "center" | "right"; h: number }
/** Fit text into a box w mm wide: shrink a little, then wrap, then shrink to the 6 pt floor, then truncate. */
export function layoutText(str: string, w: number, size: number, o: TextOpts, k = 1): TextLayout {
  const rtl = isArabic(str);
  const s = (o.upper && !rtl ? str.toUpperCase() : str).replace(/\s+/g, " ").trim();
  const weight = o.weight ?? 400;
  const font = rtl ? (weight >= 600 ? "Cairo" : "Tajawal") : o.font ?? "Montserrat";
  const ls = rtl ? 0 : o.ls ?? 0;
  const upper = !rtl && /[A-Z]/.test(s) && s === s.toUpperCase();
  const meas = (t: string, fs: number) => textWidth(t, fs, font, weight, ls, upper);
  const fs0 = Math.max(MIN_PT, o.fixed ? size : size * k);
  const maxLines = o.maxLines ?? 2;
  const align = rtl ? (!o.align || o.align === "left" ? "right" : o.align) : o.align ?? "left";
  const done = (lines: string[], fs: number): TextLayout => ({ lines, fs, font, weight: weight as Weight, ls, align, h: lines.length * fs * PT_MM * 1.2 });
  const floor = Math.max(MIN_PT, fs0 * 0.78);
  for (let fs = fs0; fs >= floor - 1e-6; fs -= 0.5) if (meas(s, fs) <= w) return done([s], fs);
  for (let fs = fs0; fs >= MIN_PT - 1e-6; fs -= 0.5) {
    const l = wrapLines(s, w, (t) => meas(t, fs));
    if (l.length <= maxLines) return done(l, fs);
  }
  const l = wrapLines(s, w, (t) => meas(t, MIN_PT)).slice(0, maxLines);
  const last = l[l.length - 1] ?? "";
  let cut = last; while (cut.length > 1 && meas(cut + "…", MIN_PT) > w) cut = cut.slice(0, -1);
  l[l.length - 1] = cut + "…";
  return done(l, MIN_PT);
}

export const initials = (s: string) => s.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => Array.from(w)[0]!.toUpperCase()).join("") || "★";
export const contactList = (d: CardDetails) => [d.phone, d.email, d.website, d.address].map((x) => (x ?? "").trim()).filter(Boolean);
export const qrValue = (d: CardDetails) => { const w = (d.website ?? "").trim(); return w ? (/^https?:\/\//i.test(w) ? w : `https://${w}`) : ""; };

/* ---------------------------------------------------------------- side builder */
const HEIGHT_OF = (e: CardElement): [number, number] => {
  switch (e.type) {
    case "text": return [e.y, e.y + e.text.split("\n").length * e.fontSize * PT_MM * 1.2];
    case "rect": case "image": return [e.y, e.y + e.h];
    case "circle": return [e.y - e.r, e.y + e.r];
    case "line": return [Math.min(e.y, e.y + e.h), Math.max(e.y, e.y + e.h)];
    case "qr": return [e.y, e.y + e.size];
  }
};
const r2 = (n: number) => Math.round(n * 100) / 100;

export class Sb {
  els: CardElement[] = [];
  private n = 0;
  constructor(public bg: string, public k = 1) {}
  private id() { return `e${++this.n}`; }

  rect(x: number, y: number, w: number, h: number, fill: string, o: { radius?: number; opacity?: number } = {}) {
    this.els.push({ id: this.id(), type: "rect", x: r2(x), y: r2(y), w: r2(w), h: r2(h), fill, ...(o.radius ? { radius: o.radius } : {}), ...(o.opacity != null ? { opacity: o.opacity } : {}) });
  }
  circle(x: number, y: number, r: number, fill: string, opacity?: number) {
    this.els.push({ id: this.id(), type: "circle", x: r2(x), y: r2(y), r: r2(r), fill, ...(opacity != null ? { opacity } : {}) });
  }
  /** A straight line between two points (mm). */
  line(x1: number, y1: number, x2: number, y2: number, color: string, thickness = 0.4) {
    this.els.push({ id: this.id(), type: "line", x: r2(x1), y: r2(y1), w: r2(x2 - x1), h: r2(y2 - y1), color, thickness });
  }
  image(x: number, y: number, w: number, h: number, src: string, fit: "contain" | "cover" = "contain") {
    this.els.push({ id: this.id(), type: "image", x: r2(x), y: r2(y), w: r2(w), h: r2(h), src, fit });
  }
  qr(x: number, y: number, size: number, value: string, color = "#000000") {
    this.els.push({ id: this.id(), type: "qr", x: r2(x), y: r2(y), size: r2(size), value, color });
  }
  /** Adds text (hidden when empty) and returns the height it uses in mm. */
  text(str: string | undefined, x: number, y: number, w: number, size: number, o: TextOpts = {}): number {
    if (!str || !str.trim()) return 0;
    const t = layoutText(str, w, size, o, this.k);
    const bg = o.on ?? this.bg;
    const color = readable(o.color ?? onColor(bg), bg, 4.8);
    this.els.push({
      id: this.id(), type: "text", x: r2(x), y: r2(y), w: r2(w), text: t.lines.join("\n"), fontSize: t.fs, fontFamily: t.font,
      fontWeight: t.weight, color, align: t.align, ...(o.italic ? { italic: true } : {}), ...(t.ls ? { letterSpacing: t.ls } : {}),
    });
    return t.h;
  }
  textH(str: string | undefined, w: number, size: number, o: TextOpts = {}) { return str && str.trim() ? layoutText(str, w, size, o, this.k).h : 0; }
  mark() { return this.els.length; }
  /** Vertical extent [top, bottom] of everything added since `from`. */
  extent(from: number): [number, number] {
    let a = Infinity, b = -Infinity;
    for (const e of this.els.slice(from)) { const [t, u] = HEIGHT_OF(e); a = Math.min(a, t); b = Math.max(b, u); }
    return Number.isFinite(a) ? [a, b] : [0, 0];
  }
  shift(from: number, dy: number) {
    this.els = this.els.map((e, i) => (i < from ? e : ({ ...e, y: r2(e.y + dy) } as CardElement)));
  }
  /** Vertically centre everything added since `from` inside [top, bottom]. */
  centre(from: number, top: number, bottom: number) {
    const [a, b] = this.extent(from);
    this.shift(from, r2((top + bottom) / 2 - (a + b) / 2));
  }
  /** Contact lines (phone, email, website, address). anchor "bottom": y is the bottom edge. Returns the height used. */
  contacts(d: CardDetails, x: number, y: number, w: number, o: TextOpts & { size?: number; step?: number; bottom?: boolean } = {}): number {
    const items = contactList(d);
    if (!items.length) return 0;
    const size = o.size ?? 6.5, gap = (o.step ?? 3.6) - size * PT_MM * 1.2;
    const hs = items.map((s) => this.textH(s, w, size, { ...o, maxLines: 2 }));
    const total = hs.reduce((a, b) => a + b, 0) + Math.max(0, gap) * (items.length - 1);
    let cy = o.bottom ? y - total : y;
    items.forEach((s, i) => { this.text(s, x, cy, w, size, { ...o, maxLines: 2 }); cy += hs[i]! + Math.max(0, gap); });
    return total;
  }
  /** Brand mark: the customer's logo, or a monogram circle (initials). `tile` puts a light plate under a logo on dark backgrounds. */
  brand(d: CardDetails, cx: number, cy: number, size: number, bg: string, fg: string, o: { font?: string; tile?: string; weight?: Weight } = {}) {
    if (d.logo) {
      const pad = o.tile ? size * 0.12 : 0;
      if (o.tile) this.rect(cx - size / 2, cy - size / 2, size, size, o.tile, { radius: 1.5 });
      this.image(cx - size / 2 + pad, cy - size / 2 + pad, size - 2 * pad, size - 2 * pad, d.logo);
      return;
    }
    this.circle(cx, cy, size / 2, bg);
    const ini = initials(d.company || d.name);
    const fs = Math.max(MIN_PT, size * (Array.from(ini).length > 1 ? 0.95 : 1.1));
    const em = fs * PT_MM;
    this.text(ini, cx - size / 2 + 0.5, cy - em * 0.5, size - 1, fs, { color: fg, on: bg, align: "center", weight: o.weight ?? 700, font: o.font ?? "Montserrat", fixed: true, maxLines: 1 });
  }
  side(): CardSide { return { background: this.bg, elements: this.els }; }
}
