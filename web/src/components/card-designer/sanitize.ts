/** Validate & clamp a CardDesign from an untrusted source (AI output or client). Pure. */
import type { CardDesign, CardElement, CardSide } from "@/lib/types";
import { CARD_FONTS } from "./fonts";

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const color = (c: unknown, fallback: string) => (typeof c === "string" && HEX.test(c.trim()) ? c.trim() : fallback);
const num = (v: unknown, min: number, max: number, fallback: number) => {
  const n = typeof v === "number" && Number.isFinite(v) ? v : fallback;
  return Math.min(max, Math.max(min, n));
};
const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
const WEIGHTS = [400, 500, 600, 700, 800] as const;
const weight = (w: unknown) => WEIGHTS.reduce((best, x) => (Math.abs(x - Number(w ?? 400)) < Math.abs(best - Number(w ?? 400)) ? x : best), 400 as (typeof WEIGHTS)[number]);
const MAX_IMAGE = 400_000; // ~300 KB data URL

function element(e: Record<string, unknown>, W: number, H: number, i: number): CardElement | null {
  const id = str(e.id, 40) || `e${i}`;
  const x = num(e.x, -W, W * 2, 0), y = num(e.y, -H, H * 2, 0);
  switch (e.type) {
    case "text": {
      const text = str(e.text, 200);
      if (!text.trim()) return null;
      const xx = num(e.x, 0, W - 5, 4);
      return {
        id, type: "text", x: xx, y: num(e.y, 0, H - 2, 4), w: num(e.w, 5, W - xx, W - xx - 4), text,
        fontSize: num(e.fontSize, 4, 40, 8),
        fontFamily: (CARD_FONTS as readonly string[]).includes(String(e.fontFamily)) ? String(e.fontFamily) : "Montserrat",
        fontWeight: weight(e.fontWeight), color: color(e.color, "#111827"),
        align: e.align === "center" || e.align === "right" ? e.align : "left",
        italic: e.italic === true || undefined, letterSpacing: e.letterSpacing != null ? num(e.letterSpacing, -1, 4, 0) : undefined,
      };
    }
    case "rect":
      return { id, type: "rect", x, y, w: num(e.w, 0.2, W * 2, 10), h: num(e.h, 0.2, H * 2, 10), fill: color(e.fill, "#e5e7eb"), radius: e.radius != null ? num(e.radius, 0, 30, 0) : undefined, opacity: e.opacity != null ? num(e.opacity, 0, 1, 1) : undefined };
    case "circle":
      return { id, type: "circle", x, y, r: num(e.r, 0.5, Math.max(W, H), 5), fill: color(e.fill, "#e5e7eb"), opacity: e.opacity != null ? num(e.opacity, 0, 1, 1) : undefined };
    case "line":
      return { id, type: "line", x, y, w: num(e.w, -W * 2, W * 2, 10), h: num(e.h, -H * 2, H * 2, 0), color: color(e.color, "#111827"), thickness: num(e.thickness, 0.1, 5, 0.4) };
    case "image": {
      const src = str(e.src, MAX_IMAGE);
      if (!/^data:image\/(png|jpe?g|webp|svg\+xml);base64,/.test(src)) return null;
      return { id, type: "image", x, y, w: num(e.w, 1, W, 15), h: num(e.h, 1, H, 15), src, fit: e.fit === "cover" ? "cover" : "contain" };
    }
    case "qr": {
      const value = str(e.value, 300);
      if (!value) return null;
      const size = num(e.size, 8, Math.min(W, H) - 4, 14);
      return { id, type: "qr", x: num(e.x, 0, W - size, 4), y: num(e.y, 0, H - size, 4), size, value, color: color(e.color, "#000000") };
    }
    default:
      return null;
  }
}

function side(s: unknown, W: number, H: number): CardSide {
  const o = (s ?? {}) as Record<string, unknown>;
  const els = Array.isArray(o.elements) ? o.elements : [];
  const seen = new Set<string>();
  const elements = els.slice(0, 40).map((e, i) => element((e ?? {}) as Record<string, unknown>, W, H, i)).filter((e): e is CardElement => !!e)
    .map((e) => { let id = e.id; while (seen.has(id)) id = `${id}_`; seen.add(id); return { ...e, id }; });
  return { background: color(o.background, "#ffffff"), elements };
}

export function sanitizeDesign(input: unknown, W = 85, H = 55): CardDesign {
  const d = (input ?? {}) as Record<string, unknown>;
  const widthMm = num(d.widthMm, 40, 120, W), heightMm = num(d.heightMm, 40, 120, H);
  return {
    widthMm, heightMm, orientation: widthMm >= heightMm ? "landscape" : "portrait",
    name: str(d.name, 60) || undefined,
    front: side(d.front, widthMm, heightMm),
    back: d.back ? side(d.back, widthMm, heightMm) : undefined,
  };
}
