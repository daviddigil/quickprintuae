import type { MockupArea } from "./types";

/** Pure builder for the print-ready proof sheet of a merchandise line (SVG string). Image hrefs must already be data URLs for a self-contained download. */
export interface MerchProofInput {
  orderNumber: string;
  productName: string;
  quantity: number;
  /** product cover photo with its natural size (used for the mockup percentages) */
  cover?: { href: string; width: number; height: number } | null;
  mockup?: MockupArea | null;
  /** uploaded artwork; `href` is null for PDFs (placeholder shown) */
  artwork?: { href: string | null; filename: string } | null;
  /** personalisation lines "Label: value" */
  text: string[];
  /** other selections "Label: value" (size, colour, print position...) */
  details: string[];
  /** text drawn over the print area (first personalisation text field value) */
  overlayText?: string;
}

export const xmlEscape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** Greedy word wrap by character count (long words are split). */
export function wrap(text: string, max: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    let w = word;
    while (w.length > max) { if (line) { out.push(line); line = ""; } out.push(w.slice(0, max)); w = w.slice(max); }
    if (!line) line = w; else if ((line + " " + w).length <= max) line += " " + w; else { out.push(line); line = w; }
  }
  if (line) out.push(line);
  return out.length ? out : [""];
}

const clamp = (n: number) => Math.min(100, Math.max(0, Number.isFinite(n) ? n : 0));

export function buildMerchProofSvg(i: MerchProofInput): string {
  const W = 1000, IMG_X = 40, IMG_Y = 110, IMG_W = 600;
  const ratio = i.cover && i.cover.width > 0 && i.cover.height > 0 ? i.cover.height / i.cover.width : 0.75;
  const imgH = Math.round(Math.min(IMG_W * ratio, 760));
  const imgW = Math.round(imgH / ratio);
  const ox = IMG_X + Math.round((IMG_W - imgW) / 2);
  const parts: string[] = [];

  // product photo + print area
  parts.push(`<rect x="${IMG_X}" y="${IMG_Y}" width="${IMG_W}" height="${imgH}" fill="#f3f4f6" stroke="#d1d5db"/>`);
  if (i.cover) parts.push(`<image href="${xmlEscape(i.cover.href)}" x="${ox}" y="${IMG_Y}" width="${imgW}" height="${imgH}" preserveAspectRatio="none"/>`);
  const m = i.mockup?.enabled ? i.mockup : null;
  const bx = m ? ox + (clamp(m.x) / 100) * imgW : IMG_X + IMG_W * 0.2;
  const by = m ? IMG_Y + (clamp(m.y) / 100) * imgH : IMG_Y + imgH * 0.2;
  const bw = m ? (clamp(Math.min(m.w, 100 - clamp(m.x))) / 100) * imgW : IMG_W * 0.6;
  const bh = m ? (clamp(Math.min(m.h, 100 - clamp(m.y))) / 100) * imgH : imgH * 0.6;
  const overlay = i.overlayText?.trim() ?? "";
  const artH = i.artwork && overlay ? bh * 0.75 : bh;
  if (i.artwork?.href) parts.push(`<image href="${xmlEscape(i.artwork.href)}" x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${bw.toFixed(1)}" height="${artH.toFixed(1)}" preserveAspectRatio="xMidYMid meet"/>`);
  else if (i.artwork) parts.push(`<rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${bw.toFixed(1)}" height="${artH.toFixed(1)}" fill="#ffffffcc"/><text x="${(bx + bw / 2).toFixed(1)}" y="${(by + artH / 2).toFixed(1)}" text-anchor="middle" font-size="18" fill="#1d1e3a">PDF artwork: see file</text>`);
  if (overlay) {
    const size = Math.max(12, Math.min(bh * 0.22, (bw / Math.max(6, overlay.length)) * 1.7));
    parts.push(`<text x="${(bx + bw / 2).toFixed(1)}" y="${(by + bh - size * 0.35).toFixed(1)}" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-weight="700" font-size="${size.toFixed(1)}" fill="#111827" stroke="#ffffff" stroke-width="${(size / 14).toFixed(1)}" paint-order="stroke">${xmlEscape(overlay)}</text>`);
  }
  parts.push(`<rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" fill="none" stroke="#e11d48" stroke-width="2" stroke-dasharray="8 5"/>`);
  parts.push(`<text x="${bx.toFixed(1)}" y="${(by - 6).toFixed(1)}" font-size="13" fill="#e11d48">print area</text>`);

  // specification column
  let y = 130;
  const col = 680;
  const heading = (t: string) => { parts.push(`<text x="${col}" y="${y}" font-size="14" font-weight="700" fill="#6b7280" letter-spacing="1">${xmlEscape(t.toUpperCase())}</text>`); y += 26; };
  const row = (t: string) => { for (const l of wrap(t, 34)) { parts.push(`<text x="${col}" y="${y}" font-size="18" fill="#111827">${xmlEscape(l)}</text>`); y += 24; } y += 4; };
  heading("Product"); row(i.productName); row(`Quantity: ${i.quantity}`);
  if (i.details.length) { y += 8; heading("Options"); i.details.forEach(row); }
  if (i.text.length) { y += 8; heading("Personalisation text"); i.text.forEach(row); }
  y += 8; heading("Artwork"); row(i.artwork ? i.artwork.filename : "No artwork uploaded");
  if (m) { y += 4; parts.push(`<text x="${col}" y="${y}" font-size="13" fill="#6b7280">Print area: x ${clamp(m.x)}% · y ${clamp(m.y)}% · ${clamp(m.w)}% × ${clamp(m.h)}% of photo</text>`); y += 20; }

  const H = Math.max(IMG_Y + imgH + 60, y + 50);
  const head = `<rect width="${W}" height="${H}" fill="#ffffff"/><text x="40" y="52" font-family="Helvetica,Arial,sans-serif" font-size="28" font-weight="800" fill="#1d1e3a">PRINT PROOF · ${xmlEscape(i.orderNumber)}</text><text x="40" y="82" font-size="16" fill="#6b7280">Check the artwork position, text and options before printing.</text>`;
  const foot = `<text x="40" y="${H - 20}" font-size="12" fill="#9ca3af">Preview only: not a colour-accurate render.</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Helvetica,Arial,sans-serif">${head}${parts.join("")}${foot}</svg>`;
}
