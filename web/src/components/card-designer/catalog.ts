/**
 * The ready-made business-card catalogue: ~17 original vector layouts x colourways, every one two-sided and built from
 * the customer's details (empty fields hidden, monogram without a logo, QR from the website, Arabic aware).
 * Pure and deterministic (ids are positional), so it runs on the client (gallery thumbnails) and the server (AI fallback).
 */
import type { CardDesign, CardSide } from "@/lib/types";
import { PT_MM } from "./fonts";
import {
  HEX, Sb, bleedify, isArabic, contrast, deep, hexRgb, mix, onColor, qrValue, rgbHex, shade, tint,
  type CardDetails, type Palette, type Weight,
} from "./kit";

export const SAFE = 4;
export const BLEED = 2;

export const CARD_CATEGORIES = ["Minimal", "Bold", "Elegant", "Corporate", "Creative", "Dark", "Industry"] as const;
export type CardCategory = (typeof CARD_CATEGORIES)[number];

export const INDUSTRIES = [
  { key: "food", label: "Food & beverage", re: /(food|restaurant|cafe|café|coffee|bakery|catering|kitchen|chef|grill)/i },
  { key: "beauty", label: "Beauty & wellness", re: /(beauty|salon|spa|fashion|boutique|wedding|event|barber|makeup|cosmetic|wellness)/i },
  { key: "tech", label: "Technology", re: /(tech|software|\bit\b|digital|\bai\b|startup|\bapp\b|cyber|cloud|data|web)/i },
  { key: "medical", label: "Medical & health", re: /(health|clinic|medical|dental|dentist|pharma|care|doctor|hospital|physio)/i },
  { key: "realestate", label: "Real estate", re: /(real estate|property|properties|realty|construct|architect|interior|broker|developer)/i },
  { key: "auto", label: "Auto & transport", re: /(auto|car|garage|motor|logistic|transport|cargo|tyre|tire|vehicle)/i },
  { key: "law", label: "Law & finance", re: /(law|legal|lawyer|advocate|finance|financial|bank|account|audit|consult|insur|invest)/i },
  { key: "education", label: "Education", re: /(edu|school|academy|tutor|training|university|college|teacher|institute|nursery)/i },
] as const;
export type IndustryKey = (typeof INDUSTRIES)[number]["key"];

export function detectIndustry(d: Pick<CardDetails, "industry" | "company" | "title">): IndustryKey | null {
  const explicit = INDUSTRIES.find((i) => i.label.toLowerCase() === (d.industry ?? "").trim().toLowerCase());
  if (explicit) return explicit.key;
  const text = `${d.industry ?? ""} ${d.company ?? ""} ${d.title ?? ""}`;
  return INDUSTRIES.find((i) => i.re.test(text))?.key ?? null;
}

/* ------------------------------------------------------------------ layouts */
interface Ctx { d: CardDetails; p: Palette; W: number; H: number; pt: boolean; m: number; k: number; qr: string; light: boolean }
type Layout = (c: Ctx) => { front: Sb; back: Sb };

const brandName = (d: CardDetails) => d.company?.trim() || d.name;
/** An accent that stays visible on a dark background. */
function lift(c: string, bg: string, min = 3) {
  let out = c;
  for (let t = 0; t <= 1 && contrast(out, bg) < min; t += 0.1) out = tint(c, t);
  return out;
}

interface BackOpts {
  ink: string; markBg: string; markFg: string; on?: string; font?: string; upper?: boolean; ls?: number; weight?: Weight; size?: number;
  qrColor?: string; tile?: string; sub?: string; region?: { x0: number; x1: number; top: number; bottom: number };
}
/** The common back: brand mark + company name (+ website text or QR), centred in a region. */
function backStd(s: Sb, c: Ctx, o: BackOpts) {
  const { d, W, H, pt, m } = c;
  const r = o.region ?? { x0: m, x1: W - m, top: m, bottom: H - m };
  const rw = r.x1 - r.x0, name = brandName(d), ms = 15;
  const i0 = s.mark();
  const to = { font: o.font, weight: o.weight ?? 700, color: o.ink, on: o.on, ls: o.ls, upper: o.upper, maxLines: 2, align: "center" as const };
  const size = o.size ?? 11;
  if (!pt && c.qr && rw >= 60) {
    const qs = Math.min(24, r.bottom - r.top);
    const colW = rw - qs - 6, cx = r.x0 + colW / 2;
    s.brand(d, cx, ms / 2, ms, o.markBg, o.markFg, { font: o.font, tile: o.tile });
    s.text(name, r.x0, ms + 3, colW, size, to);
    s.centre(i0, r.top, r.bottom);
    s.qr(r.x1 - qs, (r.top + r.bottom) / 2 - qs / 2, qs, c.qr, o.qrColor);
    return;
  }
  const cx = (r.x0 + r.x1) / 2, regionH = r.bottom - r.top;
  const th = s.textH(name, rw, size, to);
  const showMark = !c.qr || regionH >= ms + 3 + th + 4 + 14;
  let y = 0;
  if (showMark) { s.brand(d, cx, ms / 2, ms, o.markBg, o.markFg, { font: o.font, tile: o.tile }); y = ms + 3; }
  y += s.text(name, r.x0, y, rw, size, to);
  if (c.qr) {
    const qs = Math.max(12, Math.min(26, rw, regionH - y - 4));
    s.qr(cx - qs / 2, y + 4, qs, c.qr, o.qrColor);
  } else if (d.website?.trim()) {
    s.text(d.website, r.x0, y + 1.5, rw, 7, { ...to, weight: 500, color: o.sub ?? o.ink, ls: 0, upper: false, maxLines: 1 });
  }
  s.centre(i0, r.top, r.bottom);
}

/** Dotted/blocky pattern of circles and squares. */
function pattern(s: Sb, x0: number, y0: number, cols: number, rows: number, cell: number, base: string, accent: string) {
  const a = tint(base, 0.3), b = shade(base, 0.22), w = tint(base, 0.85);
  for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++) {
    if ((r * 3 + q * 5) % 7 === 0) continue;
    const cx = x0 + (q + 0.5) * cell, cy = y0 + (r + 0.5) * cell, t = (r + q) % 4;
    if (t === 0) s.circle(cx, cy, cell * 0.36, a);
    else if (t === 1) s.rect(cx - cell * 0.3, cy - cell * 0.3, cell * 0.6, cell * 0.6, b, { radius: 0.8 });
    else if (t === 2) s.circle(cx, cy, cell * 0.2, w);
    else s.rect(cx - cell * 0.22, cy - cell * 0.22, cell * 0.44, cell * 0.44, accent, { radius: 0.5 });
  }
}

const LAYOUTS: Record<string, Layout> = {
  /* white card, small accent, QR on the back */
  minimal(c) {
    const { d, p, W, H, pt, m } = c, w = W - 2 * m;
    const f = new Sb("#ffffff", c.k), b = new Sb("#ffffff", c.k);
    f.circle(W - m - 1.4, m + 1.4, 1.4, p.primary);
    let y = m + (pt ? 6 : 5);
    y += f.text(d.name, m, y, w, pt ? 14 : 15, { weight: 700, color: p.ink, maxLines: 3 }) + 1.4;
    y += f.text(d.title, m, y, w, 7.5, { weight: 600, color: p.primary, ls: 0.3 }) + 2.4;
    f.rect(m, y, 12, 0.9, p.primary);
    f.contacts(d, m, H - m, w, { color: p.muted, bottom: true });
    b.rect(0, H - 3, W, 3, p.primary);
    backStd(b, c, { ink: p.ink, markBg: p.primary, markFg: onColor(p.primary), region: { x0: m, x1: W - m, top: m, bottom: H - m - 2 } });
    return { front: f, back: b };
  },

  /* light grey marble with an orange colour block */
  marble(c) {
    const { d, p, W, H, pt, m } = c, bg = p.light;
    const f = new Sb(bg, c.k), b = new Sb(p.primary, c.k);
    const v1 = shade(bg, 0.07), v2 = shade(bg, 0.04);
    f.line(-3, H * 0.35, W * 0.6, -3, v1, 0.5); f.line(-3, H * 0.72, W * 0.85, -3, v2, 0.3);
    f.line(W * 0.15, H + 3, W * 0.9, H * 0.1, v2, 0.4); f.line(W * 0.45, H + 3, W + 3, H * 0.45, v1, 0.3);
    const strip = pt ? 26 : 23;
    let tw: number, bottom: number;
    if (!pt) {
      f.rect(W - strip, 0, strip, H, p.primary);
      f.brand(d, W - strip / 2, H / 2, 14, "#ffffff", p.primary, { tile: "#ffffff" });
      tw = W - strip - m - 5; bottom = H - m;
    } else {
      f.rect(0, H - strip, W, strip, p.primary);
      f.brand(d, W / 2, H - strip / 2, 14, "#ffffff", p.primary, { tile: "#ffffff" });
      tw = W - 2 * m; bottom = H - strip - 5;
    }
    const on = shade(bg, 0.09); // text must stay readable over the marble veins too
    let y = m + 3;
    y += f.text(d.name, m, y, tw, 13.5, { weight: 800, color: p.ink, on, maxLines: 3 }) + 1.2;
    y += f.text(d.title, m, y, tw, 7.5, { weight: 600, color: shade(p.primary, 0.35), on }) + 1.6;
    f.text(d.company, m, y, tw, 7, { color: p.muted, weight: 500, on });
    f.contacts(d, m, bottom, tw, { color: p.ink, on, bottom: true });
    backStd(b, c, { ink: onColor(p.primary), markBg: "#ffffff", markFg: p.primary, tile: "#ffffff", qrColor: "#111111" });
    b.rect(0, H - 3, W, 3, deep(p.secondary, 0.1));
    return { front: f, back: b };
  },

  /* navy with thin gold lines (also law / finance) */
  navyGold(c) {
    const { d, p, W, H, m } = c;
    const bg = deep(p.secondary, 0.06), gold = lift(p.primary, bg);
    const f = new Sb(bg, c.k), b = new Sb(bg, c.k);
    const frame = (s: Sb) => {
      s.rect(3, 3, W - 6, H - 6, gold); s.rect(3.35, 3.35, W - 6.7, H - 6.7, bg);
      s.rect(4.8, 4.8, W - 9.6, H - 9.6, gold); s.rect(5, 5, W - 10, H - 10, bg);
    };
    frame(f); frame(b);
    const x = m + 2, w = W - 2 * x, i0 = f.mark();
    let y = 0;
    y += f.text(d.name, x, y, w, 13.5, { font: "Playfair Display", weight: 600, color: "#ffffff", align: "center", ls: 0.4, maxLines: 3 }) + 1.8;
    y += f.text(d.title, x, y, w, 6.5, { font: "Raleway", weight: 600, color: gold, align: "center", ls: 1.2, upper: true }) + 2.6;
    f.line(W / 2 - 8, y, W / 2 + 8, y, gold, 0.35); y += 3;
    f.contacts(d, x, y, w, { color: tint(bg, 0.78), align: "center", font: "Raleway", step: 3.4, size: 6.5 });
    f.centre(i0, x, H - x);
    backStd(b, c, { ink: gold, markBg: gold, markFg: bg, tile: "#f5f5f4", font: "Playfair Display", upper: true, ls: 1.2, size: 10, weight: 600, region: { x0: x, x1: W - x, top: x, bottom: H - x } });
    return { front: f, back: b };
  },

  /* black with a neon accent */
  neon(c) {
    const { d, p, W, H, pt, m } = c;
    const bg = deep(p.secondary, 0.03), acc = lift(p.primary, bg, 4.5);
    const f = new Sb(bg, c.k), b = new Sb(acc, c.k);
    f.rect(0, 0, 2.2, H, acc);
    let tw: number, bottom: number;
    if (!pt) { f.circle(W + 2, -2, 18, acc); tw = W - 2 * m - 22; bottom = H - m; }
    else { f.circle(W + 2, H + 2, 18, acc); tw = W - 2 * m; bottom = H - 22; }
    let y = m + 4;
    y += f.text(d.name, m, y, tw, 14, { weight: 800, color: "#ffffff", maxLines: 3 }) + 1.4;
    y += f.text(d.title, m, y, tw, 7.5, { weight: 600, color: acc, ls: 0.4 }) + 1.4;
    f.text(d.company, m, y, tw, 6.5, { color: "#d4d4d8", weight: 500, upper: true, ls: 0.8 });
    f.contacts(d, m, bottom, tw, { color: "#e4e4e7", bottom: true });
    backStd(b, c, { ink: bg, markBg: bg, markFg: acc, tile: "#ffffff", qrColor: "#000000", font: "Montserrat" });
    b.rect(0, H - 2.4, W, 2.4, bg);
    return { front: f, back: b };
  },

  /* colour block with black and white sides */
  colorBlock(c) {
    const { d, p, W, H, pt, m } = c;
    const dark = deep(p.secondary, 0.05), col = p.primary;
    const f = new Sb("#ffffff", c.k), b = new Sb(dark, c.k);
    let x: number, y: number, tw: number, bottom: number;
    if (!pt) {
      const bw = Math.round(W * 0.4);
      f.rect(0, 0, bw, H, col);
      f.brand(d, bw / 2, H / 2 - 4, 14, "#ffffff", col, { tile: "#ffffff" });
      f.text(d.company, 4, H / 2 + 6, bw - 8, 7.5, { align: "center", weight: 700, on: col, color: onColor(col), maxLines: 2 });
      f.rect(bw, H - 3, W - bw, 3, dark);
      x = bw + 6; y = m + 3; tw = W - x - m; bottom = H - 7;
    } else {
      const bh = Math.round(H * 0.34);
      f.rect(0, 0, W, bh, col);
      f.brand(d, W / 2, bh / 2 - 3, 14, "#ffffff", col, { tile: "#ffffff" });
      f.text(d.company, m, bh / 2 + 7, W - 2 * m, 7.5, { align: "center", weight: 700, on: col, color: onColor(col), maxLines: 2 });
      f.rect(0, H - 3, W, 3, dark);
      x = m; y = bh + 6; tw = W - 2 * m; bottom = H - 7;
    }
    y += f.text(d.name, x, y, tw, 13, { weight: 800, color: p.ink, maxLines: 3 }) + 1.2;
    f.text(d.title, x, y, tw, 7.5, { weight: 600, color: col });
    f.contacts(d, x, bottom, tw, { color: p.muted, bottom: true });
    if (!pt) b.rect(0, 0, 5, H, col); else b.rect(0, H - 5, W, 5, col);
    backStd(b, c, { ink: "#ffffff", markBg: col, markFg: onColor(col), tile: "#ffffff", region: pt ? { x0: m, x1: W - m, top: m, bottom: H - 8 } : { x0: m + 2, x1: W - m, top: m, bottom: H - m } });
    return { front: f, back: b };
  },

  /* teal geometric pattern of circles and squares */
  geoTeal(c) {
    const { d, p, W, H, pt, m } = c;
    const col = p.primary, dark = deep(p.secondary, 0.09), acc = tint(col, 0.55);
    const f = new Sb(col, c.k), b = new Sb(dark, c.k);
    const cell = 9;
    let x = m, y = m + 3, tw: number, bottom = H - m;
    if (!pt) {
      const cols = 3, rows = Math.floor((H + 3) / cell);
      pattern(f, W - cols * cell, (H - rows * cell) / 2, cols, rows, cell, col, acc);
      tw = W - cols * cell - m - 4;
    } else {
      const cols = Math.floor(W / cell);
      pattern(f, (W - cols * cell) / 2, 0, cols, 2, cell, col, acc);
      y = 2 * cell + 5; tw = W - 2 * m;
    }
    y += f.text(d.name, x, y, tw, 13, { weight: 800, color: "#ffffff", maxLines: 3 }) + 1.4;
    y += f.text(d.title, x, y, tw, 7.5, { weight: 600, color: tint(col, 0.82) }) + 1.2;
    f.text(d.company, x, y, tw, 6.5, { weight: 500, color: "#ffffff", upper: true, ls: 0.8 });
    f.contacts(d, x, bottom, tw, { color: "#ffffff", bottom: true });
    const brows = H <= 60 ? 1 : 2, bcols = Math.floor(W / cell);
    pattern(b, (W - bcols * cell) / 2, H - brows * cell, bcols, brows, cell, mix(col, dark, 0.2), acc);
    backStd(b, c, { ink: "#ffffff", markBg: col, markFg: "#ffffff", tile: "#ffffff", region: { x0: m, x1: W - m, top: m, bottom: H - brows * cell - 3 } });
    return { front: f, back: b };
  },

  /* orange diagonal band */
  diagBand(c) {
    const { d, p, W, H, pt, m } = c;
    const col = p.primary, dark = deep(p.secondary, 0.06);
    const f = new Sb("#ffffff", c.k), b = new Sb(dark, c.k);
    const band = (s: Sb, colr: string) => {
      for (const i of [-1.5, -0.5, 0.5, 1.5]) {
        if (!pt) s.line(W * 0.74 + i * 4.8, H + 3, W * 0.92 + i * 4.8, -3, colr, 5);
        else s.line(-4, H - 8 + i * 4.6, W + 4, H - 24 + i * 4.6, colr, 5);
      }
    };
    band(f, col);
    let tw: number, bottom: number;
    if (!pt) { f.brand(d, W * 0.83, H / 2, 13, "#ffffff", dark, { tile: "#ffffff" }); tw = W * 0.74 - 10.2 - m - 3; bottom = H - m; }
    else { f.brand(d, W / 2, H - 16, 13, "#ffffff", dark, { tile: "#ffffff" }); tw = W - 2 * m; bottom = H - 37; }
    let y = m + 3;
    y += f.text(d.name, m, y, tw, 13, { weight: 800, color: p.ink, maxLines: 3 }) + 1.2;
    y += f.text(d.title, m, y, tw, 7.5, { weight: 600, color: shade(col, 0.3) }) + 1;
    f.text(d.company, m, y, tw, 6.5, { color: p.muted, weight: 500, upper: true, ls: 0.6 });
    f.contacts(d, m, bottom, tw, { color: p.ink, bottom: true });
    band(b, col);
    backStd(b, c, { ink: "#ffffff", markBg: col, markFg: onColor(col), tile: "#ffffff", region: pt ? { x0: m, x1: W - m, top: m, bottom: H - 40 } : { x0: m, x1: W * 0.74 - 11, top: m, bottom: H - m } });
    return { front: f, back: b };
  },

  /* vintage badge: double frame, ornaments */
  vintage(c) {
    const { d, p, W, H } = c;
    const bg = c.light ? p.light : deep(p.secondary, 0.04), line = c.light ? p.primary : lift(p.primary, bg);
    const fg = c.light ? p.ink : "#ffffff";
    const f = new Sb(bg, c.k), b = new Sb(bg, c.k);
    const frame = (s: Sb) => {
      s.rect(3, 3, W - 6, H - 6, line); s.rect(3.45, 3.45, W - 6.9, H - 6.9, bg);
      s.rect(5, 5, W - 10, H - 10, line); s.rect(5.3, 5.3, W - 10.6, H - 10.6, bg);
    };
    const orn = (s: Sb, y: number) => { s.line(W / 2 - 14, y, W / 2 - 3, y, line, 0.3); s.circle(W / 2, y, 1.1, line); s.line(W / 2 + 3, y, W / 2 + 14, y, line, 0.3); };
    frame(f); frame(b);
    const x = 9.5, w = W - 19, i0 = f.mark();
    let y = 0;
    y += f.text(d.name, x, y, w, 13, { font: "Playfair Display", weight: 700, color: line, align: "center", upper: true, ls: 0.8, maxLines: 3 }) + 2.2;
    orn(f, y + 0.5); y += 3;
    y += f.text(d.title, x, y, w, 7.5, { font: "Lora", italic: true, color: fg, align: "center" }) + 1.8;
    f.contacts(d, x, y, w, { color: fg, align: "center", font: "Lora", step: 3.4, size: 6.5 });
    f.centre(i0, x, H - x);
    backStd(b, c, { ink: line, markBg: line, markFg: bg, tile: "#ffffff", font: "Playfair Display", upper: true, ls: 1, size: 10, region: { x0: x, x1: W - x, top: x, bottom: H - x } });
    return { front: f, back: b };
  },

  /* red + dark split: bold, auto / real estate */
  redSplit(c) {
    const { d, p, W, H, pt, m } = c;
    const dark = deep(p.secondary, 0.05), red = p.primary, onRed = onColor(red);
    const f = new Sb(dark, c.k), b = new Sb(red, c.k);
    let tw: number, bottom: number;
    if (!pt) {
      const sp = Math.round(W * 0.62);
      f.rect(sp, 0, W - sp, H, red); f.rect(sp - 1, 0, 1, H, "#ffffff");
      const cx = sp + (W - sp) / 2, hasQr = !!c.qr;
      f.brand(d, cx, hasQr ? 17 : H / 2, 14, "#ffffff", red, { tile: "#ffffff" });
      if (hasQr) { const qs = Math.min(18, W - sp - 8); f.qr(cx - qs / 2, H - m - qs, qs, c.qr, "#111111"); }
      tw = sp - m - 6; bottom = H - m;
    } else {
      const sp = Math.round(H * 0.64);
      f.rect(0, sp, W, H - sp, red); f.rect(0, sp - 1, W, 1, "#ffffff");
      const pc = sp + (H - sp) / 2;
      if (c.qr) { f.brand(d, m + 7, pc, 14, "#ffffff", red, { tile: "#ffffff" }); f.qr(W - m - 18, pc - 9, 18, c.qr, "#111111"); }
      else f.brand(d, W / 2, pc, 14, "#ffffff", red, { tile: "#ffffff" });
      tw = W - 2 * m; bottom = sp - 5;
    }
    let y = m + 3;
    y += f.text(d.name, m, y, tw, 14, { font: "Oswald", weight: 700, color: "#ffffff", upper: true, ls: 0.5, maxLines: 3 }) + 1.2;
    y += f.text(d.title, m, y, tw, 7.5, { weight: 600, color: lift(red, dark, 4.5) }) + 1;
    f.text(d.company, m, y, tw, 6.5, { color: "#d4d4d8", upper: true, ls: 0.6 });
    f.contacts(d, m, bottom, tw, { color: "#f4f4f5", bottom: true });
    b.rect(0, H - 4, W, 4, dark);
    backStd(b, c, { ink: onRed, markBg: "#ffffff", markFg: red, tile: "#ffffff", font: "Oswald", upper: true, ls: 1, size: 12, qrColor: "#111111", region: { x0: m, x1: W - m, top: m, bottom: H - 8 } });
    return { front: f, back: b };
  },

  /* vertical portrait split (landscape: block on the left) */
  verticalSplit(c) {
    const { d, p, W, H, pt, m } = c;
    const col = p.primary, dark = deep(p.secondary, 0.08);
    const f = new Sb("#ffffff", c.k), b = new Sb(col, c.k);
    let x = m, y: number, tw: number, al: "center" | "left" = "center";
    if (pt) {
      const bh = Math.round(H * 0.36);
      f.rect(0, 0, W, bh, col);
      f.text(d.company, m, m + 1, W - 2 * m, 7, { align: "center", weight: 700, on: col, color: onColor(col), upper: true, ls: 1, maxLines: 2 });
      f.circle(W / 2, bh, 11, "#ffffff");
      f.brand(d, W / 2, bh, 17, col, onColor(col), { font: "Playfair Display" });
      y = bh + 15; tw = W - 2 * m;
    } else {
      const bw = Math.round(W * 0.36);
      f.rect(0, 0, bw, H, col);
      f.circle(bw, H / 2, 11, "#ffffff");
      f.brand(d, bw, H / 2, 17, col, onColor(col), { font: "Playfair Display" });
      x = bw + 15; y = m + 3; tw = W - x - m; al = "left";
    }
    y += f.text(d.name, x, y, tw, 13, { font: "Playfair Display", weight: 700, color: p.ink, align: al, maxLines: 3 }) + 1.4;
    y += f.text(d.title, x, y, tw, 7, { weight: 600, color: col, align: al, upper: true, ls: 0.8 }) + 2.4;
    if (pt) { f.line(W / 2 - 7, y, W / 2 + 7, y, col, 0.4); y += 3; } else { f.rect(x, y, 10, 0.7, col); y += 2.6; }
    f.contacts(d, x, y, tw, { color: p.muted, align: al, step: 3.5 });
    b.rect(0, H - 4, W, 4, dark);
    backStd(b, c, { ink: onColor(col), markBg: "#ffffff", markFg: col, tile: "#ffffff", font: "Playfair Display", size: 11, qrColor: "#111111", region: { x0: m, x1: W - m, top: m, bottom: H - 8 } });
    return { front: f, back: b };
  },

  /* logo-centred minimal */
  logoCentre(c) {
    const { d, p, W, H, pt, m } = c, w = W - 2 * m;
    const bg = c.light ? p.light : "#ffffff";
    const f = new Sb(bg, c.k), b = new Sb(bg, c.k);
    const i0 = f.mark();
    f.brand(d, W / 2, 9, 18, p.primary, onColor(p.primary), { font: "Playfair Display" });
    let y = 23;
    y += f.text(brandName(d), m, y, w, 10.5, { weight: 700, color: p.ink, align: "center", upper: true, ls: 1, maxLines: 2 }) + 2.4;
    f.rect(W / 2 - 6, y, 12, 0.8, p.primary);
    f.centre(i0, m, H - m);
    f.rect(0, H - 2.4, W, 2.4, p.primary);
    const sideQr = !pt && !!c.qr, qs = 22;
    const colW = sideQr ? W - 2 * m - qs - 8 : w, al = sideQr ? "left" as const : "center" as const;
    const j0 = b.mark();
    let by = 0;
    by += b.text(d.name, m, by, colW, 12, { weight: 700, color: p.ink, align: al, maxLines: 3 }) + 1.2;
    by += b.text(d.title, m, by, colW, 7, { weight: 600, color: p.primary, align: al, ls: 0.3 }) + 2;
    b.rect(al === "left" ? m : W / 2 - 5, by, 10, 0.7, p.primary); by += 2.6;
    b.contacts(d, m, by, colW, { color: p.muted, align: al });
    if (pt && c.qr) { const [, bot] = b.extent(j0); b.qr(W / 2 - qs / 2, bot + 4, qs, c.qr, p.ink); }
    b.centre(j0, m, H - m - 2);
    if (sideQr) b.qr(W - m - qs, H / 2 - qs / 2, qs, c.qr, p.ink);
    return { front: f, back: b };
  },

  /* name left, QR right */
  nameQr(c) {
    const { d, p, W, H, pt, m } = c;
    const col = p.primary, dark = deep(p.secondary, 0.1);
    const f = new Sb("#ffffff", c.k), b = new Sb(col, c.k);
    f.rect(0, 0, W, 2.5, col);
    const hasQr = !!c.qr, qs = pt ? 22 : 24;
    const tw = W - 2 * m;
    let y = m + 1;
    y += f.text(d.company, m, y, tw, 6.5, { weight: 700, color: col, upper: true, ls: 1.2 }) + 1.6;
    f.rect(m, y, 8, 0.7, col); y += 3;
    y += f.text(d.name, m, y, tw, 14, { weight: 700, color: p.ink, maxLines: 3 }) + 1.2;
    f.text(d.title, m, y, tw, 7.5, { color: p.muted, weight: 500 });
    if (hasQr) {
      if (!pt) { f.qr(W - m - qs, H - m - qs, qs, c.qr, p.ink); f.contacts(d, m, H - m, W - 2 * m - qs - 4, { color: p.ink, bottom: true }); }
      else { f.qr(W / 2 - qs / 2, H - m - qs, qs, c.qr, p.ink); f.contacts(d, m, H - m - qs - 4, tw, { color: p.ink, bottom: true }); }
    } else f.contacts(d, m, H - m, tw, { color: p.ink, bottom: true });
    b.rect(0, H - 4, W, 4, dark);
    backStd(b, c, { ink: onColor(col), markBg: "#ffffff", markFg: col, tile: "#ffffff", region: { x0: m, x1: W - m, top: m, bottom: H - 8 } });
    return { front: f, back: b };
  },

  /* monogram circle */
  monogram(c) {
    const { d, p, W, H, pt, m } = c;
    const bg = c.light ? p.light : "#ffffff", col = p.primary;
    const f = new Sb(bg, c.k), b = new Sb(col, c.k);
    let x: number, tw: number, al: "left" | "center";
    if (!pt) {
      const cx = m + 12;
      f.circle(cx, H / 2, 12, col); f.circle(cx, H / 2, 11.3, bg);
      f.brand(d, cx, H / 2, 17, bg, col, { font: "Playfair Display" });
      x = cx + 12 + 7; tw = W - x - m; al = "left";
    } else {
      f.circle(W / 2, m + 13, 12, col); f.circle(W / 2, m + 13, 11.3, bg);
      f.brand(d, W / 2, m + 13, 17, bg, col, { font: "Playfair Display" });
      x = m; tw = W - 2 * m; al = "center";
    }
    const i0 = f.mark();
    let y = 0;
    y += f.text(d.name, x, y, tw, 13.5, { font: "Playfair Display", weight: 700, color: p.ink, align: al, maxLines: 3 }) + 1.4;
    y += f.text(d.title, x, y, tw, 7.5, { font: "Lora", italic: true, color: col, align: al }) + 2;
    if (al === "left") f.rect(x, y, 10, 0.7, col); else f.rect(W / 2 - 5, y, 10, 0.7, col);
    y += 2.6;
    f.contacts(d, x, y, tw, { color: p.muted, align: al, font: "Lora", step: 3.5 });
    if (pt) f.centre(i0, m + 28, H - m); else f.centre(i0, m, H - m);
    backStd(b, c, { ink: onColor(col), markBg: "#ffffff", markFg: col, tile: "#ffffff", font: "Playfair Display", size: 11, qrColor: "#111111" });
    return { front: f, back: b };
  },

  /* dark luxury: black + gold */
  luxeDark(c) {
    const { d, p, W, H, pt, m } = c, w = W - 2 * m;
    const bg = deep(p.secondary, 0.03), gold = lift(p.primary, bg, 4.5);
    const f = new Sb(bg, c.k), b = new Sb(bg, c.k);
    f.rect(m, m, 16, 0.5, gold);
    let y = m + 5;
    y += f.text(d.name, m, y, w, 11.5, { font: "Playfair Display", weight: 600, color: gold, upper: true, ls: 1.2, maxLines: 3 }) + 1.6;
    f.text(d.title, m, y, w, 6.5, { font: "Raleway", color: "#d4d4d8", ls: 0.6, upper: true });
    const ch = f.contacts(d, m, H - m - 1, w, { color: "#e7e5e4", font: "Raleway", step: 3.4, size: 6.5, bottom: true });
    f.rect(0, H - 3, W, 0.4, gold);
    if (ch) f.rect(m, H - m - 1 - ch - 3, W - 2 * m, 0.3, gold);
    backStd(b, c, { ink: gold, markBg: gold, markFg: bg, tile: "#f5f5f4", font: "Playfair Display", upper: true, ls: 1.4, size: 9.5, weight: 600, qrColor: "#000000", region: { x0: m, x1: W - m, top: m + 3, bottom: H - m - 2 } });
    b.rect(m, m, 16, 0.5, gold); b.rect(W - m - 16, H - m - 0.5, 16, 0.5, gold);
    b.rect(0, H - 3, W, 0.4, gold);
    return { front: f, back: b };
  },

  /* empty round photo slot */
  photoSlot(c) {
    const { d, p, W, H, pt, m } = c;
    const col = p.primary, soft = tint(col, 0.82), bg = tint(col, 0.94);
    const f = new Sb(bg, c.k), b = new Sb(col, c.k);
    let x: number, tw: number, al: "left" | "center";
    f.circle(W + 2, -2, 16, tint(col, 0.78));
    if (!pt) {
      const cx = m + 13;
      f.circle(cx, H / 2, 13.8, col); f.circle(cx, H / 2, 12.6, soft);
      x = m + 33; tw = W - x - m; al = "left";
    } else {
      f.circle(W / 2, m + 16, 14, col); f.circle(W / 2, m + 16, 12.8, soft);
      x = m; tw = W - 2 * m; al = "center";
    }
    const i0 = f.mark();
    let y = 0;
    y += f.text(d.name, x, y, tw, 13, { weight: 800, color: p.ink, align: al, maxLines: 3 }) + 1.2;
    y += f.text(d.title, x, y, tw, 7.5, { weight: 600, color: shade(col, 0.2), align: al }) + 1.6;
    y += f.text(d.company, x, y, tw, 6.5, { color: p.muted, align: al, upper: true, ls: 0.6 }) + 2.2;
    f.contacts(d, x, y, tw, { color: p.ink, align: al, step: 3.5 });
    if (pt) f.centre(i0, m + 36, H - m); else f.centre(i0, m, H - m);
    b.circle(W - 4, H + 2, 18, shade(col, 0.15));
    backStd(b, c, { ink: onColor(col), markBg: "#ffffff", markFg: col, tile: "#ffffff", qrColor: "#111111" });
    return { front: f, back: b };
  },

  /* corporate with a side bar */
  sideBar(c) {
    const { d, p, W, H, pt, m } = c;
    const col = p.primary, dark = deep(p.secondary, 0.08);
    const f = new Sb("#ffffff", c.k), b = new Sb(dark, c.k);
    let x = m, y: number, tw: number, bottom = H - m;
    if (!pt) {
      f.rect(0, 0, 24, H, col); f.rect(24, 0, 1.4, H, dark);
      f.brand(d, 12, H / 2, 14, "#ffffff", col, { tile: "#ffffff" });
      x = 31; tw = W - x - m; y = m + 3;
    } else {
      f.rect(0, 0, W, 24, col); f.rect(0, 24, W, 1.4, dark);
      f.brand(d, W / 2, 12, 14, "#ffffff", col, { tile: "#ffffff" });
      tw = W - 2 * m; y = 24 + 8;
    }
    y += f.text(d.name, x, y, tw, 12.5, { weight: 700, color: p.ink, maxLines: 3 }) + 1.2;
    y += f.text(d.title, x, y, tw, 7, { color: p.muted, weight: 500 }) + 1;
    f.text(d.company, x, y, tw, 7, { color: shade(col, 0.15), weight: 700 });
    f.contacts(d, x, bottom, tw, { color: p.ink, bottom: true });
    if (!pt) { b.rect(0, 0, 5, H, col); } else { b.rect(0, 0, W, 5, col); }
    backStd(b, c, { ink: "#ffffff", markBg: col, markFg: onColor(col), tile: "#ffffff", region: pt ? { x0: m, x1: W - m, top: 9, bottom: H - m } : { x0: m + 3, x1: W - m, top: m, bottom: H - m } });
    return { front: f, back: b };
  },

  /* creative blobs */
  blobs(c) {
    const { d, p, W, H, pt, m } = c;
    const c1 = p.primary, c2 = p.secondary, c3 = tint(c1, 0.55);
    const f = new Sb("#ffffff", c.k), b = new Sb(shade(c1, 0.15), c.k);
    let x = m, y: number, tw: number, bottom = H - m;
    if (!pt) {
      f.circle(W - 6, 6, 18, c1, 0.92); f.circle(W + 2, 24, 10, c2, 0.88); f.circle(W - 25, -2, 8, c3, 0.9); f.circle(W + 1, H - 4, 8, tint(c2, 0.5), 0.9);
      tw = W - 2 * m - 30; y = m + 6;
    } else {
      f.circle(W - 8, 6, 18, c1, 0.92); f.circle(8, -1, 11, c2, 0.88); f.circle(W / 2 + 4, 4, 7, c3, 0.9);
      tw = W - 2 * m; y = 30; x = m;
    }
    y += f.text(d.name, x, y, tw, 13.5, { weight: 800, color: p.ink, maxLines: 3 }) + 1.2;
    y += f.text(d.title, x, y, tw, 7.5, { weight: 600, color: shade(c1, 0.25) }) + 1;
    f.text(d.company, x, y, tw, 6.5, { color: p.muted, upper: true, ls: 0.7 });
    f.contacts(d, x, bottom, tw, { color: p.ink, bottom: true });
    b.circle(W + 2, -2, 15, shade(c1, 0.3)); b.circle(-2, H + 2, 13, shade(c2, 0.25)); b.circle(W - 14, H + 1, 6, shade(c3, 0.35));
    backStd(b, c, { ink: "#ffffff", markBg: "#ffffff", markFg: shade(c1, 0.15), tile: "#ffffff", qrColor: "#111111", region: { x0: m + 4, x1: W - m - 4, top: m + 2, bottom: H - m - 2 } });
    return { front: f, back: b };
  },
};

/* ------------------------------------------------------------------ registry */
export interface CardTemplate {
  id: string;
  name: string;
  category: CardCategory;
  industry?: IndustryKey;
  tags: string[];
  orientation: "landscape" | "portrait" | "both";
  /** the template's own colourway; replaced by the customer's brand colours when they ask for them */
  palette: Palette;
  layout: string;
  build: (d: CardDetails, p: Palette, W: number, H: number) => { front: CardSide; back: CardSide; name: string };
}

const P = (primary: string, secondary: string, ink: string, muted: string, light: string): Palette => ({ primary, secondary, ink, muted, light });

interface Def { id: string; name: string; layout: string; category: CardCategory; industry?: IndustryKey; tags: string[]; orientation?: CardTemplate["orientation"]; light?: boolean; palette: Palette }

const DEFS: Def[] = [
  // Minimal
  { id: "minimal-slate", name: "Clean Slate", layout: "minimal", category: "Minimal", tags: ["white", "clean", "qr", "blue"], orientation: "both", palette: P("#2563eb", "#0f172a", "#0f172a", "#475569", "#f1f5f9") },
  { id: "minimal-terracotta", name: "Terracotta Line", layout: "minimal", category: "Minimal", tags: ["white", "warm", "qr", "orange"], orientation: "both", palette: P("#c2410c", "#431407", "#1c1917", "#57534e", "#fff7ed") },
  { id: "minimal-sage", name: "Sage Note", layout: "minimal", category: "Minimal", tags: ["white", "green", "calm", "qr"], orientation: "both", palette: P("#15803d", "#14532d", "#14201a", "#4b5a50", "#f0fdf4") },
  { id: "logo-ivory", name: "Ivory Studio", layout: "logoCentre", category: "Minimal", tags: ["logo", "centred", "cream", "serif"], orientation: "both", light: true, palette: P("#9a3412", "#292524", "#292524", "#57534e", "#faf6ef") },
  { id: "logo-clean", name: "Logo Clean", layout: "logoCentre", category: "Minimal", tags: ["logo", "centred", "white", "teal"], orientation: "both", palette: P("#0f766e", "#134e4a", "#0f172a", "#475569", "#f0fdfa") },
  { id: "monogram-ink", name: "Monogram Ink", layout: "monogram", category: "Minimal", tags: ["monogram", "circle", "serif", "black"], orientation: "both", palette: P("#111827", "#111827", "#111827", "#4b5563", "#ffffff") },
  { id: "monogram-rose", name: "Monogram Rose", layout: "monogram", category: "Minimal", tags: ["monogram", "circle", "pink", "soft"], orientation: "both", light: true, palette: P("#9d174d", "#500724", "#1f1720", "#6b5a63", "#fdf2f8") },
  // Bold
  { id: "marble-orange", name: "Marble Orange", layout: "marble", category: "Bold", tags: ["marble", "grey", "orange", "block"], orientation: "both", palette: P("#ea580c", "#27272a", "#18181b", "#52525b", "#ecebe7") },
  { id: "marble-teal", name: "Marble Teal", layout: "marble", category: "Bold", tags: ["marble", "grey", "teal", "block"], orientation: "both", palette: P("#0f766e", "#134e4a", "#18181b", "#52525b", "#e8e8e6") },
  { id: "block-magenta", name: "Pop Magenta", layout: "colorBlock", category: "Bold", tags: ["pink", "magenta", "block", "black"], orientation: "both", palette: P("#c4005f", "#111111", "#111111", "#52525b", "#ffffff") },
  { id: "block-cobalt", name: "Cobalt Block", layout: "colorBlock", category: "Bold", tags: ["blue", "block", "black"], orientation: "both", palette: P("#1d4ed8", "#0b1020", "#0b1020", "#475569", "#ffffff") },
  { id: "diag-orange", name: "Orange Sweep", layout: "diagBand", category: "Bold", tags: ["orange", "diagonal", "band"], orientation: "both", palette: P("#f97316", "#18181b", "#18181b", "#52525b", "#ffffff") },
  { id: "diag-ruby", name: "Ruby Sweep", layout: "diagBand", category: "Bold", tags: ["red", "diagonal", "band"], orientation: "both", palette: P("#e11d48", "#0f172a", "#0f172a", "#475569", "#ffffff") },
  { id: "split-red", name: "Red Split", layout: "redSplit", category: "Bold", tags: ["red", "dark", "split", "qr"], orientation: "both", palette: P("#dc2626", "#1c1917", "#1c1917", "#57534e", "#ffffff") },
  // Elegant
  { id: "navy-gold", name: "Navy & Gold", layout: "navyGold", category: "Elegant", tags: ["navy", "gold", "lines", "serif"], orientation: "both", palette: P("#c9a227", "#0f2a4a", "#0f2a4a", "#475569", "#f8fafc") },
  { id: "burgundy-gilt", name: "Burgundy Gilt", layout: "navyGold", category: "Elegant", tags: ["burgundy", "gold", "lines", "serif"], orientation: "both", palette: P("#d9b76a", "#4a0e1c", "#4a0e1c", "#57534e", "#fdf8f0") },
  { id: "forest-gilt", name: "Forest Gilt", layout: "navyGold", category: "Elegant", tags: ["green", "gold", "lines", "serif"], orientation: "both", palette: P("#cfae5a", "#0f3b2e", "#0f3b2e", "#4b5a50", "#f4f7f2") },
  { id: "vintage-badge", name: "Vintage Badge", layout: "vintage", category: "Elegant", tags: ["vintage", "badge", "yellow", "black", "frame"], orientation: "both", palette: P("#facc15", "#0a0a0a", "#0a0a0a", "#52525b", "#fefce8") },
  { id: "vintage-cream", name: "Vintage Cream", layout: "vintage", category: "Elegant", tags: ["vintage", "badge", "cream", "brown", "frame"], orientation: "both", light: true, palette: P("#7c4a1e", "#3b2412", "#3b2412", "#6b5a4a", "#faf3e3") },
  // Corporate
  { id: "corp-navy", name: "Corporate Navy", layout: "nameQr", category: "Corporate", tags: ["blue", "qr", "business", "clean"], orientation: "both", palette: P("#1d4ed8", "#0f2a4a", "#0f172a", "#475569", "#eff6ff") },
  { id: "corp-graphite", name: "Graphite Orange", layout: "nameQr", category: "Corporate", tags: ["grey", "orange", "qr", "business"], orientation: "both", palette: P("#c2410c", "#27272a", "#18181b", "#52525b", "#fafafa") },
  { id: "sidebar-blue", name: "Sidebar Blue", layout: "sideBar", category: "Corporate", tags: ["bar", "blue", "business"], orientation: "both", palette: P("#1e40af", "#0f172a", "#0f172a", "#475569", "#eff6ff") },
  { id: "sidebar-green", name: "Sidebar Green", layout: "sideBar", category: "Corporate", tags: ["bar", "green", "business"], orientation: "both", palette: P("#047857", "#064e3b", "#0f1f1a", "#4b5a50", "#ecfdf5") },
  { id: "portrait-corporate", name: "Portrait Corporate", layout: "verticalSplit", category: "Corporate", tags: ["portrait", "vertical", "blue", "split"], orientation: "portrait", palette: P("#1e3a8a", "#0f172a", "#0f172a", "#475569", "#eff6ff") },
  // Creative
  { id: "geo-teal", name: "Teal Mosaic", layout: "geoTeal", category: "Creative", tags: ["teal", "pattern", "circles", "squares", "geometric"], orientation: "both", palette: P("#0f766e", "#134e4a", "#0f172a", "#475569", "#f0fdfa") },
  { id: "geo-violet", name: "Violet Mosaic", layout: "geoTeal", category: "Creative", tags: ["violet", "pattern", "circles", "squares", "geometric"], orientation: "both", palette: P("#6d28d9", "#2e1065", "#1e1b4b", "#52525b", "#f5f3ff") },
  { id: "blobs-sunset", name: "Sunset Blobs", layout: "blobs", category: "Creative", tags: ["blobs", "pink", "orange", "playful"], orientation: "both", palette: P("#e11d48", "#f59e0b", "#1f2937", "#52525b", "#fff1f2") },
  { id: "blobs-ocean", name: "Ocean Blobs", layout: "blobs", category: "Creative", tags: ["blobs", "blue", "teal", "playful"], orientation: "both", palette: P("#0369a1", "#14b8a6", "#0f172a", "#475569", "#f0f9ff") },
  { id: "photo-coral", name: "Photo Coral", layout: "photoSlot", category: "Creative", tags: ["photo", "portrait", "round", "coral"], orientation: "both", palette: P("#ea580c", "#9a3412", "#1c1917", "#57534e", "#fff7ed") },
  { id: "portrait-violet", name: "Portrait Violet", layout: "verticalSplit", category: "Creative", tags: ["portrait", "vertical", "violet", "split"], orientation: "portrait", palette: P("#7c3aed", "#2e1065", "#1e1b4b", "#52525b", "#f5f3ff") },
  // Dark
  { id: "neon-lime", name: "Neon Lime", layout: "neon", category: "Dark", tags: ["black", "lime", "neon", "new", "tech"], orientation: "both", palette: P("#a3e635", "#09090b", "#f4f4f5", "#a1a1aa", "#18181b") },
  { id: "neon-cyan", name: "Neon Cyan", layout: "neon", category: "Dark", tags: ["black", "cyan", "neon", "tech"], orientation: "both", palette: P("#22d3ee", "#08111c", "#f4f4f5", "#a1a1aa", "#0b1622") },
  { id: "neon-ember", name: "Ember Night", layout: "neon", category: "Dark", tags: ["black", "orange", "neon", "bold"], orientation: "both", palette: P("#fb923c", "#0c0a09", "#f4f4f5", "#a1a1aa", "#1c1917") },
  { id: "luxe-gold", name: "Black & Gold", layout: "luxeDark", category: "Dark", tags: ["black", "gold", "luxury", "serif"], orientation: "both", palette: P("#c9a227", "#0c0c0c", "#f5f5f4", "#a8a29e", "#18181b") },
  { id: "luxe-rose", name: "Rose Gold Night", layout: "luxeDark", category: "Dark", tags: ["charcoal", "rose gold", "luxury"], orientation: "both", palette: P("#e0a98a", "#1c1917", "#f5f5f4", "#a8a29e", "#292524") },
  { id: "luxe-silver", name: "Silver Midnight", layout: "luxeDark", category: "Dark", tags: ["midnight", "silver", "luxury"], orientation: "both", palette: P("#cbd5e1", "#0b1220", "#f1f5f9", "#94a3b8", "#111827") },
  // Industry
  { id: "food-bakery", name: "Artisan Bakery", layout: "vintage", category: "Industry", industry: "food", tags: ["food", "bakery", "cafe", "cream", "brown"], orientation: "both", light: true, palette: P("#9a3412", "#431407", "#431407", "#6b4a3a", "#fff4e0") },
  { id: "food-fresh", name: "Fresh Kitchen", layout: "blobs", category: "Industry", industry: "food", tags: ["food", "restaurant", "green", "orange"], orientation: "both", palette: P("#15803d", "#ea580c", "#14201a", "#4b5a50", "#f7fee7") },
  { id: "beauty-blush", name: "Blush Studio", layout: "verticalSplit", category: "Industry", industry: "beauty", tags: ["beauty", "salon", "pink", "portrait"], orientation: "portrait", palette: P("#be185d", "#500724", "#2a1020", "#6b5a63", "#fdf2f8") },
  { id: "beauty-rose", name: "Rose Beauty", layout: "photoSlot", category: "Industry", industry: "beauty", tags: ["beauty", "salon", "spa", "photo", "pink"], orientation: "both", palette: P("#be185d", "#831843", "#2a1020", "#6b5a63", "#fdf2f8") },
  { id: "tech-indigo", name: "Circuit Indigo", layout: "geoTeal", category: "Industry", industry: "tech", tags: ["tech", "software", "indigo", "pattern"], orientation: "both", palette: P("#4338ca", "#1e1b4b", "#0f172a", "#475569", "#eef2ff") },
  { id: "tech-cyan", name: "Tech Scan", layout: "nameQr", category: "Industry", industry: "tech", tags: ["tech", "startup", "qr", "cyan"], orientation: "both", palette: P("#0e7490", "#0f172a", "#0f172a", "#475569", "#ecfeff") },
  { id: "medical-teal", name: "Care Teal", layout: "sideBar", category: "Industry", industry: "medical", tags: ["medical", "clinic", "teal", "clean"], orientation: "both", palette: P("#0e7490", "#164e63", "#0f172a", "#475569", "#ecfeff") },
  { id: "medical-green", name: "Clinic Green", layout: "nameQr", category: "Industry", industry: "medical", tags: ["medical", "dental", "green", "qr"], orientation: "both", palette: P("#047857", "#064e3b", "#0f1f1a", "#4b5a50", "#ecfdf5") },
  { id: "realestate-navy", name: "Estate Navy", layout: "redSplit", category: "Industry", industry: "realestate", tags: ["real estate", "property", "navy", "gold"], orientation: "both", palette: P("#b8892b", "#0f2a4a", "#0f2a4a", "#475569", "#ffffff") },
  { id: "realestate-agent", name: "Agent Portrait", layout: "photoSlot", category: "Industry", industry: "realestate", tags: ["real estate", "agent", "photo", "navy"], orientation: "both", palette: P("#1e3a5f", "#0f2a4a", "#0f172a", "#475569", "#eff6ff") },
  { id: "auto-red", name: "Auto Red", layout: "redSplit", category: "Industry", industry: "auto", tags: ["auto", "garage", "red", "black"], orientation: "both", palette: P("#dc2626", "#111111", "#111111", "#52525b", "#ffffff") },
  { id: "auto-sweep", name: "Garage Sweep", layout: "diagBand", category: "Industry", industry: "auto", tags: ["auto", "transport", "red", "diagonal"], orientation: "both", palette: P("#ef4444", "#111827", "#111827", "#52525b", "#ffffff") },
  { id: "law-counsel", name: "Counsel", layout: "navyGold", category: "Industry", industry: "law", tags: ["law", "legal", "navy", "gold"], orientation: "both", palette: P("#b8975a", "#14213d", "#14213d", "#475569", "#f8fafc") },
  { id: "finance-ledger", name: "Ledger Green", layout: "luxeDark", category: "Industry", industry: "law", tags: ["finance", "accounting", "green", "dark"], orientation: "both", palette: P("#34d399", "#06231a", "#ecfdf5", "#94a3b8", "#0b2f23") },
  { id: "edu-campus", name: "Campus Blue", layout: "colorBlock", category: "Industry", industry: "education", tags: ["education", "school", "blue"], orientation: "both", palette: P("#1d4ed8", "#1e293b", "#1e293b", "#475569", "#ffffff") },
  { id: "edu-bright", name: "Bright Classroom", layout: "blobs", category: "Industry", industry: "education", tags: ["education", "kids", "academy", "playful"], orientation: "both", palette: P("#2563eb", "#f59e0b", "#1e293b", "#475569", "#eff6ff") },
];

const nonEmpty = (s: CardSide): CardSide => ({ ...s, elements: s.elements.filter((e) => e.type !== "text" || e.text.trim() !== "") });
const fits = (s: Sb, H: number) => s.els.every((e) => e.type !== "text" || e.y + e.text.split("\n").length * e.fontSize * PT_MM * 1.2 <= H - SAFE + 0.05);

function run(layout: Layout, d: CardDetails, p: Palette, W: number, H: number, light: boolean) {
  let out!: ReturnType<Layout>;
  for (const k of [1, 0.92, 0.84, 0.76]) {
    out = layout({ d, p, W, H, pt: H > W, m: 6, k, qr: qrValue(d), light });
    if (fits(out.front, H) && fits(out.back, H)) break;
  }
  // Arabic cards read right to left: left-aligned Latin lines (phone, email) follow the same edge
  if (isArabic(d.name)) for (const sb of [out.front, out.back]) sb.els = sb.els.map((e) => (e.type === "text" && e.align === "left" ? { ...e, align: "right" as const } : e));
  return out;
}

export const CARD_TEMPLATES: CardTemplate[] = DEFS.map((t) => ({
  id: t.id, name: t.name, category: t.category, industry: t.industry, tags: t.tags, orientation: t.orientation ?? "both", palette: t.palette, layout: t.layout,
  build(d, p, W, H) {
    const out = run(LAYOUTS[t.layout]!, d, p, W, H, !!t.light);
    return { name: t.name, front: bleedify(nonEmpty(out.front.side()), W, H), back: bleedify(nonEmpty(out.back.side()), W, H) };
  },
}));

/** The template's own palette, or the customer's brand colours when `details.colors` is set. */
export function resolvePalette(t: Pick<CardTemplate, "palette">, d: CardDetails): Palette {
  const cols = (d.colors ?? []).filter((c) => HEX.test(c)).map((c) => rgbHex(hexRgb(c)));
  if (!cols.length) return t.palette;
  return { ...t.palette, primary: cols[0]!, secondary: cols[1] ?? t.palette.secondary, light: tint(cols[0]!, 0.93) };
}

/** A complete two-sided design (or front only) from a template and the customer's details. */
export function buildDesign(t: CardTemplate, d: CardDetails, W = 85, H = 55, doubleSided = true): CardDesign {
  const out = t.build(d, resolvePalette(t, d), W, H);
  return { widthMm: W, heightMm: H, orientation: W >= H ? "landscape" : "portrait", name: out.name, front: out.front, back: doubleSided ? out.back : undefined };
}

/* ------------------------------------------------------------------ choosing & filtering */
export function fitsOrientation(t: CardTemplate, W: number, H: number) {
  return t.orientation === "both" || (t.orientation === "portrait") === (H > W);
}

const STYLE_CATEGORIES: [RegExp, CardCategory[]][] = [
  [/(lux|elegant|premium|gold|vintage|classic)/, ["Elegant", "Dark"]],
  [/(dark|neon|night)/, ["Dark", "Bold"]],
  [/(bold|loud|colou?r)/, ["Bold", "Creative"]],
  [/(creative|playful|fun|modern)/, ["Creative", "Bold", "Minimal"]],
  [/(corporate|professional|formal|business)/, ["Corporate", "Elegant", "Minimal"]],
  [/(minimal|clean|simple)/, ["Minimal", "Corporate"]],
];

/** Best-match score for a template (industry first, then style); higher is better. */
export function scoreTemplate(t: CardTemplate, d: CardDetails): number {
  let s = 0;
  const ind = detectIndustry(d);
  if (ind && t.industry === ind) s += 10;
  const style = (d.style ?? "").toLowerCase();
  const cats = STYLE_CATEGORIES.find(([re]) => re.test(style))?.[1];
  if (cats) { const i = cats.indexOf(t.category); if (i >= 0) s += 6 - i; }
  if (!ind && t.category === "Industry") s -= 1;
  return s;
}

/** The best `count` templates for these details and card size, preferring different layouts. */
export function recommend(d: CardDetails, W = 85, H = 55, count = 3): CardTemplate[] {
  const ranked = CARD_TEMPLATES.filter((t) => fitsOrientation(t, W, H))
    .map((t, i) => ({ t, s: scoreTemplate(t, d), i })).sort((a, b) => b.s - a.s || a.i - b.i).map((x) => x.t);
  const out: CardTemplate[] = [], layouts = new Set<string>();
  for (const t of ranked) if (out.length < count && !layouts.has(t.layout)) { out.push(t); layouts.add(t.layout); }
  for (const t of ranked) if (out.length < count && !out.includes(t)) out.push(t);
  return out;
}

