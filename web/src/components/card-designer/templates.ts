/**
 * Deterministic business-card templates. Used as the offline fallback for the AI designer
 * (no ANTHROPIC_API_KEY) and as "start from template" in the editor. Pure — safe on client & server.
 */
import type { CardDesign, CardElement, CardSide } from "@/lib/types";
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

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
export function paletteFor(d: CardDetails): Palette {
  const base = INDUSTRY_PALETTES.find(([re]) => re.test(`${d.industry ?? ""} ${d.company ?? ""} ${d.title ?? ""}`))?.[1] ?? DEFAULT_PALETTE;
  const [p, s] = (d.colors ?? []).filter((c) => HEX.test(c));
  return { ...base, primary: p ?? base.primary, secondary: s ?? base.secondary };
}

let seq = 0;
const uid = () => `el${(++seq).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Shrink font size so an estimated text width fits inside w (mm). */
export function fitFont(text: string, fontSize: number, w: number, min = 5) {
  const est = (fs: number) => text.length * fs * PT_MM * 0.56;
  let fs = fontSize;
  while (fs > min && est(fs) > w) fs -= 0.5;
  return fs;
}

type TextOpts = Partial<Extract<CardElement, { type: "text" }>>;
const T = (text: string, x: number, y: number, w: number, fontSize: number, o: TextOpts = {}): CardElement => ({
  id: uid(), type: "text", x, y, w, text, fontSize: fitFont(text, fontSize, w), fontFamily: o.fontFamily ?? "Montserrat",
  fontWeight: o.fontWeight ?? 400, color: o.color ?? "#111827", align: o.align ?? "left", italic: o.italic, letterSpacing: o.letterSpacing,
});
const R = (x: number, y: number, w: number, h: number, fill: string, o: { radius?: number; opacity?: number } = {}): CardElement => ({ id: uid(), type: "rect", x, y, w, h, fill, ...o });
const C = (x: number, y: number, r: number, fill: string, opacity?: number): CardElement => ({ id: uid(), type: "circle", x, y, r, fill, opacity });
const L = (x: number, y: number, w: number, color: string, thickness = 0.4): CardElement => ({ id: uid(), type: "line", x, y, w, h: 0, color, thickness });

const initials = (s: string) => s.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "★";
const contacts = (d: CardDetails) => [d.phone, d.email, d.website, d.address].filter((x): x is string => !!x && x.trim() !== "");

function contactBlock(d: CardDetails, x: number, y: number, w: number, color: string, align: "left" | "center" | "right" = "left", font = "Montserrat", step = 3.6, size = 7) {
  return contacts(d).map((c, i) => T(c, x, y + i * step, w, size, { color, align, fontFamily: font }));
}

function logoOrMark(d: CardDetails, x: number, y: number, size: number, bg: string, fg: string, font = "Montserrat"): CardElement[] {
  if (d.logo) return [{ id: uid(), type: "image", x, y, w: size, h: size, src: d.logo, fit: "contain" }];
  const mark = initials(d.company || d.name);
  return [C(x + size / 2, y + size / 2, size / 2, bg), T(mark, x, y + size / 2 - size * 0.22, size, size * 1.15, { color: fg, align: "center", fontWeight: 800, fontFamily: font })];
}

export type TemplateFn = (d: CardDetails, p: Palette, W: number, H: number) => { front: CardSide; back: CardSide; name: string };

export const TEMPLATES: Record<string, TemplateFn> = {
  minimal(d, p, W, H) {
    const m = 6;
    return {
      name: "Minimal",
      front: { background: "#ffffff", elements: [
        T(d.name, m, m + 2, W - 2 * m, 13, { fontWeight: 700, color: p.ink }),
        T(d.title ?? "", m, m + 9, W - 2 * m, 7.5, { color: p.primary, fontWeight: 600, letterSpacing: 0.4 }),
        L(m, m + 15, 14, p.primary, 0.8),
        ...contactBlock(d, m, H - m - contacts(d).length * 3.6 + 0.6, W - 2 * m, p.muted),
      ] },
      back: { background: p.primary, elements: [
        ...logoOrMark(d, W / 2 - 7, H / 2 - 12, 14, "#ffffff", p.primary),
        T(d.company ?? d.name, m, H / 2 + 5, W - 2 * m, 11, { color: "#ffffff", align: "center", fontWeight: 700, letterSpacing: 0.6 }),
      ] },
    };
  },
  band(d, p, W, H) {
    const band = Math.min(28, W * 0.33);
    const x = band + 5;
    return {
      name: "Bold band",
      front: { background: "#ffffff", elements: [
        R(0, 0, band, H, p.primary),
        ...logoOrMark(d, band / 2 - 8, H / 2 - 8, 16, "#ffffff", p.primary, "Poppins"),
        T(d.name, x, 8, W - x - 5, 12, { fontWeight: 700, color: p.ink, fontFamily: "Poppins" }),
        T(d.title ?? "", x, 14.5, W - x - 5, 7, { color: p.muted, fontFamily: "Poppins" }),
        T(d.company ?? "", x, 19.5, W - x - 5, 7, { color: p.primary, fontWeight: 600, fontFamily: "Poppins" }),
        ...contactBlock(d, x, H - 6 - contacts(d).length * 3.5, W - x - 5, p.ink, "left", "Poppins", 3.5, 6.5),
      ] },
      back: { background: p.secondary, elements: [
        R(0, H - 4, W, 4, p.primary),
        T(d.company ?? d.name, 6, H / 2 - 3, W - 12, 13, { color: "#ffffff", align: "center", fontWeight: 700, fontFamily: "Poppins" }),
        T(d.website ?? "", 6, H / 2 + 5, W - 12, 7, { color: "#ffffffcc", align: "center", fontFamily: "Poppins" }),
      ] },
    };
  },
  classic(d, p, W, H) {
    return {
      name: "Centred classic",
      front: { background: p.light, elements: [
        T(d.name, 6, H * 0.22, W - 12, 13, { align: "center", fontWeight: 700, color: p.ink, fontFamily: "Playfair Display" }),
        T(d.title ?? "", 6, H * 0.22 + 7, W - 12, 7, { align: "center", color: p.primary, italic: true, fontFamily: "Lora" }),
        L(W / 2 - 10, H * 0.22 + 13, 20, p.secondary, 0.5),
        ...contactBlock(d, 6, H * 0.22 + 17, W - 12, p.muted, "center", "Lora", 3.5, 6.5),
      ] },
      back: { background: p.primary, elements: [
        T(d.company ?? d.name, 6, H / 2 - 4, W - 12, 14, { color: "#ffffff", align: "center", fontWeight: 700, fontFamily: "Playfair Display" }),
        L(W / 2 - 8, H / 2 + 5, 16, p.secondary, 0.6),
      ] },
    };
  },
  luxe(d, _p, W, H) {
    const gold = "#c9a227";
    return {
      name: "Dark luxe",
      front: { background: "#111111", elements: [
                L(6, H - 6, W - 12, gold, 0.3),
        T(d.name.toUpperCase(), 7, 9, W - 14, 11, { color: gold, fontWeight: 600, letterSpacing: 1.2, fontFamily: "Playfair Display" }),
        T(d.title ?? "", 7, 16, W - 14, 7, { color: "#d4d4d4", fontFamily: "Raleway", letterSpacing: 0.5 }),
        ...contactBlock(d, 7, H - 9 - contacts(d).length * 3.4, W - 14, "#e5e5e5", "left", "Raleway", 3.4, 6.5),
      ] },
      back: { background: "#111111", elements: [
        ...logoOrMark(d, W / 2 - 8, H / 2 - 13, 16, gold, "#111111", "Playfair Display"),
        T((d.company ?? d.name).toUpperCase(), 6, H / 2 + 6, W - 12, 9, { color: gold, align: "center", letterSpacing: 1.5, fontFamily: "Playfair Display" }),
      ] },
    };
  },
  geometry(d, p, W, H) {
    return {
      name: "Corner geometry",
      front: { background: "#ffffff", elements: [
        C(W - 6, 6, 18, p.primary, 0.95),
        C(W - 1, 20, 9, p.secondary, 0.85),
        T(d.name, 6, H * 0.4, W * 0.62, 12.5, { fontWeight: 800, color: p.ink, fontFamily: "Raleway" }),
        T(d.title ?? "", 6, H * 0.4 + 6.5, W * 0.62, 7, { color: p.primary, fontWeight: 600, fontFamily: "Raleway" }),
        ...contactBlock(d, 6, H - 5 - contacts(d).length * 3.4, W - 12, p.muted, "left", "Raleway", 3.4, 6.3),
      ] },
      back: { background: p.secondary, elements: [
        C(0, H, 22, p.primary, 0.9),
        T(d.company ?? d.name, 6, H / 2 - 4, W - 12, 13, { color: "#ffffff", align: "center", fontWeight: 800, fontFamily: "Raleway" }),
      ] },
    };
  },
  corporate(d, p, W, H) {
    const qr = d.website ? 15 : 0;
    const els: CardElement[] = [
      R(0, 0, W, 9, p.primary),
      T(d.company ?? "", 6, 2.6, W - 12, 8, { color: "#ffffff", fontWeight: 700, fontFamily: "Inter", letterSpacing: 0.4 }),
      T(d.name, 6, 15, W - 12 - qr, 12, { fontWeight: 700, color: p.ink, fontFamily: "Inter" }),
      T(d.title ?? "", 6, 21.5, W - 12 - qr, 7, { color: p.muted, fontFamily: "Inter" }),
      ...contactBlock(d, 6, H - 5 - contacts(d).length * 3.4, W - 14 - qr, p.ink, "left", "Inter", 3.4, 6.3),
    ];
    if (d.website) els.push({ id: uid(), type: "qr", x: W - 6 - qr, y: H - 6 - qr, size: qr, value: d.website.startsWith("http") ? d.website : `https://${d.website}`, color: p.ink });
    return {
      name: "Corporate",
      front: { background: "#ffffff", elements: els },
      back: { background: p.light, elements: [
        ...logoOrMark(d, W / 2 - 8, H / 2 - 10, 16, p.primary, "#ffffff", "Inter"),
        T(d.company ?? d.name, 6, H / 2 + 8, W - 12, 9, { color: p.primary, align: "center", fontWeight: 700, fontFamily: "Inter" }),
      ] },
    };
  },
  split(d, p, W, H) {
    const half = W * 0.45;
    return {
      name: "Split",
      front: { background: "#ffffff", elements: [
        R(0, 0, half, H, p.secondary),
        T(d.name, 4, H / 2 - 7, half - 8, 11, { color: "#ffffff", fontWeight: 700, fontFamily: "Oswald", letterSpacing: 0.5 }),
        T(d.title ?? "", 4, H / 2 + 0.5, half - 8, 7, { color: p.primary === p.secondary ? "#ffffff" : p.primary, fontFamily: "Oswald" }),
        ...contactBlock(d, half + 4, H / 2 - (contacts(d).length * 3.5) / 2, W - half - 8, p.ink, "left", "Montserrat", 3.5, 6.2),
      ] },
      back: { background: p.primary, elements: [
        R(0, H - 2.5, W, 2.5, p.secondary),
        T(d.company ?? d.name, 6, H / 2 - 4, W - 12, 13, { color: "#ffffff", align: "center", fontWeight: 600, fontFamily: "Oswald", letterSpacing: 1 }),
      ] },
    };
  },
};

/** Shapes touching the trim edge are extended into the 2 mm bleed so no white slivers appear after cutting. */
function bleedify(side: CardSide, W: number, H: number, b = 2): CardSide {
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

/** Choose templates suited to the requested style, always returning `count` distinct designs. */
export function templateDesigns(d: CardDetails, opts: { widthMm?: number; heightMm?: number; count?: number; doubleSided?: boolean } = {}): CardDesign[] {
  const W = opts.widthMm ?? 85, H = opts.heightMm ?? 55;
  const p = paletteFor(d);
  const style = `${d.style ?? ""}`.toLowerCase();
  let order = ["minimal", "band", "corporate", "geometry", "classic", "luxe", "split"];
  if (/(lux|elegant|premium|gold)/.test(style)) order = ["luxe", "classic", "minimal", ...order];
  else if (/(bold|creative|modern|playful)/.test(style)) order = ["geometry", "band", "split", ...order];
  else if (/(corporate|professional|formal)/.test(style)) order = ["corporate", "classic", "minimal", ...order];
  const names = [...new Set(order)].slice(0, opts.count ?? 3);
  return names.map((n) => {
    const t = TEMPLATES[n](d, p, W, H);
    return {
      widthMm: W, heightMm: H, orientation: W >= H ? "landscape" : "portrait", name: t.name,
      front: bleedify({ ...t.front, elements: t.front.elements.filter((e) => e.type !== "text" || e.text.trim() !== "") }, W, H),
      back: opts.doubleSided === false ? undefined : bleedify({ ...t.back, elements: t.back.elements.filter((e) => e.type !== "text" || e.text.trim() !== "") }, W, H),
    };
  });
}

export function blankDesign(W = 85, H = 55): CardDesign {
  return { widthMm: W, heightMm: H, orientation: W >= H ? "landscape" : "portrait", front: { background: "#ffffff", elements: [] }, back: { background: "#ffffff", elements: [] } };
}
