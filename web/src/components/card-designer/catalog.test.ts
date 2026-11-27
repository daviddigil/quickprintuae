import { test } from "node:test";
import assert from "node:assert/strict";
import type { CardDesign, CardElement, CardSide } from "@/lib/types";
import { CARD_CATEGORIES, CARD_TEMPLATES, INDUSTRIES, SAFE, BLEED, buildDesign, detectIndustry, fitsOrientation, recommend, resolvePalette } from "./catalog";
import { contrast, hexRgb, rgbHex } from "./kit";
import { PT_MM } from "./fonts";
import { sanitizeDesign } from "./sanitize";
import { cardSvgString } from "./render";
import { templateDesigns, paletteFor } from "./templates";

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const INPUTS: Record<string, { name: string; title?: string; company?: string; phone?: string; email?: string; website?: string; address?: string; logo?: string; colors?: string[] }> = {
  empty: { name: "" },
  minimal: { name: "Sara Ali" },
  maximal: { name: "Fatima Al Mansoori", title: "Managing Partner & Head of Legal", company: "Al Noor Legal Consultants LLC", phone: "+971 50 123 4567", email: "fatima.almansoori@alnoor-legal.ae", website: "www.alnoor-legal.ae", address: "Office 1204, Business Bay Tower, Sheikh Zayed Road, Dubai, UAE", logo: PNG },
  arabic: { name: "فاطمة المنصوري", title: "الشريك الإداري", company: "مكتب النور للاستشارات القانونية", phone: "+971 50 123 4567", email: "fatima@alnoor.ae", website: "alnoor.ae", address: "دبي، الإمارات العربية المتحدة" },
  long80: { name: "Abdulrahman Mohammed Al Mansoori Al Hashimi bin Rashid Al Maktoum Al Falasi Jr", title: "Chief Executive Officer", company: "Emirates Advanced Technology Solutions Trading", phone: "+971 4 123 4567", email: "ceo@emirates-advanced-tech.ae", website: "emirates-advanced-tech.ae" },
  nologo: { name: "Omar Khan", title: "Designer", company: "Studio Khan", email: "omar@khan.ae", website: "khan.ae" },
  logo: { name: "Omar Khan", title: "Designer", company: "Studio Khan", email: "omar@khan.ae", website: "khan.ae", logo: PNG },
  brand: { name: "Layla Hassan", title: "Dentist", company: "Smile Clinic", phone: "+971 55 000 1111", website: "smile.ae", colors: ["#7c3aed", "#facc15"] },
  brandDark: { name: "Layla Hassan", title: "Dentist", company: "Smile Clinic", phone: "+971 55 000 1111", website: "smile.ae", colors: ["#ffff00", "#ffffff"] },
  brandNavy: { name: "Layla Hassan", title: "Dentist", company: "Smile Clinic", phone: "+971 55 000 1111", website: "smile.ae", colors: ["#0a0a3a", "#111111"] },
};
const SIZES: [number, number][] = [[85, 55], [55, 85], [90, 50], [60, 60]];

/* ---------- colour painter: what is actually behind a point of the card ---------- */
function blend(under: string, over: string, a: number) {
  const [u, o] = [hexRgb(under), hexRgb(over)];
  return rgbHex([u[0] + (o[0] - u[0]) * a, u[1] + (o[1] - u[1]) * a, u[2] + (o[2] - u[2]) * a]);
}
function distSeg(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
  const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / l2));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}
function colourAt(s: CardSide, x: number, y: number, upTo = Infinity): string {
  let c = s.background;
  s.elements.forEach((e, i) => {
    if (i >= upTo) return;
    if (e.type === "rect" && x >= e.x && x <= e.x + e.w && y >= e.y && y <= e.y + e.h) c = blend(c, e.fill, e.opacity ?? 1);
    else if (e.type === "circle" && Math.hypot(x - e.x, y - e.y) <= e.r) c = blend(c, e.fill, e.opacity ?? 1);
    else if (e.type === "line" && distSeg(x, y, e.x, e.y, e.x + e.w, e.y + e.h) <= e.thickness / 2) c = e.color;
  });
  return c;
}
const textHeight = (e: Extract<CardElement, { type: "text" }>) => e.text.split("\n").length * e.fontSize * PT_MM * 1.2;
function samples(e: Extract<CardElement, { type: "text" }>): [number, number][] {
  const lh = e.fontSize * PT_MM * 1.2, pts: [number, number][] = [];
  e.text.split("\n").forEach((line, i) => {
    const w = Math.min(e.w, line.length * e.fontSize * PT_MM * 0.5);
    const x0 = e.align === "center" ? e.x + (e.w - w) / 2 : e.align === "right" ? e.x + e.w - w : e.x;
    const cy = e.y + lh * (i + 0.5);
    for (const fx of [0.02, 0.5, 0.98]) pts.push([x0 + w * fx, cy]);
    pts.push([x0 + w / 2, cy - lh * 0.3], [x0 + w / 2, cy + lh * 0.3]);
  });
  return pts;
}

function checkSide(label: string, s: CardSide, W: number, H: number, strictBox = true) {
  assert.ok(s.elements.length <= 40, `${label}: ${s.elements.length} elements`);
  assert.equal(new Set(s.elements.map((e) => e.id)).size, s.elements.length, `${label}: unique ids`);
  s.elements.forEach((e, idx) => {
    if (e.type === "text") {
      assert.ok(e.text.trim() !== "", `${label}: empty text`);
      assert.ok(e.fontSize >= 6 - 1e-6, `${label}: font ${e.fontSize}pt too small ("${e.text}")`);
      if (strictBox) {
        assert.ok(e.x >= SAFE - 0.01 && e.x + e.w <= W - SAFE + 0.01, `${label}: text "${e.text}" outside safe width (${e.x}..${e.x + e.w})`);
        assert.ok(e.y >= SAFE - 0.01 && e.y + textHeight(e) <= H - SAFE + 0.1, `${label}: text "${e.text}" outside safe height (${e.y}..${e.y + textHeight(e)} of ${H})`);
      }
      let worst = Infinity, at = "";
      for (const [x, y] of samples(e)) { const bg = colourAt(s, x, y, idx); const c = contrast(e.color, bg); if (c < worst) { worst = c; at = `${bg}@${x.toFixed(1)},${y.toFixed(1)}`; } }
      assert.ok(worst >= 4.49, `${label}: text "${e.text}" ${e.color} contrast ${worst.toFixed(2)} on ${at}`);
    } else if (e.type === "qr" || e.type === "image") {
      const w = e.type === "qr" ? e.size : e.w, h = e.type === "qr" ? e.size : e.h;
      assert.ok(e.x >= SAFE - 0.01 && e.x + w <= W - SAFE + 0.01 && e.y >= SAFE - 0.01 && e.y + h <= H - SAFE + 0.01, `${label}: ${e.type} outside safe area (${e.x},${e.y},${w}x${h})`);
    } else if (e.type === "rect") {
      assert.ok(e.x >= -BLEED - 0.01 && e.y >= -BLEED - 0.01 && e.x + e.w <= W + BLEED + 0.01 && e.y + e.h <= H + BLEED + 0.01, `${label}: rect beyond bleed (${e.x},${e.y},${e.w}x${e.h})`);
    } else if (e.type === "circle") {
      assert.ok(e.x >= -BLEED - 0.01 && e.x <= W + BLEED + 0.01 && e.y >= -BLEED - 0.01 && e.y <= H + BLEED + 0.01, `${label}: circle centre beyond bleed`);
    }
  });
}

test("catalogue: 36+ templates, unique ids and names, every category has 3+, 6+ portrait-capable, every industry covered", () => {
  assert.ok(CARD_TEMPLATES.length >= 36, `${CARD_TEMPLATES.length} templates`);
  assert.equal(new Set(CARD_TEMPLATES.map((t) => t.id)).size, CARD_TEMPLATES.length);
  assert.equal(new Set(CARD_TEMPLATES.map((t) => t.name)).size, CARD_TEMPLATES.length);
  for (const c of CARD_CATEGORIES) assert.ok(CARD_TEMPLATES.filter((t) => t.category === c).length >= 3, `category ${c}`);
  assert.ok(CARD_TEMPLATES.filter((t) => t.orientation !== "landscape").length >= 6);
  assert.ok(CARD_TEMPLATES.filter((t) => t.orientation === "portrait").length >= 3);
  for (const i of INDUSTRIES) assert.ok(CARD_TEMPLATES.some((t) => t.category === "Industry" && t.industry === i.key), `industry ${i.key}`);
  assert.ok(new Set(CARD_TEMPLATES.map((t) => t.layout)).size >= 14);
});

for (const t of CARD_TEMPLATES) {
  test(`template ${t.id}: valid, sanitize-clean, inside the safe area, readable, deterministic`, () => {
    for (const [W, H] of SIZES) for (const [key, input] of Object.entries(INPUTS)) {
      const label = `${t.id} ${W}x${H} ${key}`;
      const d = buildDesign(t, input, W, H);
      assert.ok(d.back, `${label}: two-sided`);
      const portrait = H > W;
      // layouts are designed for the card's own orientation; other shapes must still be valid and printable
      const strict = fitsOrientation(t, W, H) || !portrait;
      checkSide(`${label} front`, d.front, W, H, strict); checkSide(`${label} back`, d.back!, W, H, strict);
      const clean = sanitizeDesign(d, W, H);
      assert.deepEqual(JSON.parse(JSON.stringify(clean)), JSON.parse(JSON.stringify(d)), `${label}: sanitizeDesign changes the design`);
      assert.deepEqual(JSON.parse(JSON.stringify(buildDesign(t, input, W, H))), JSON.parse(JSON.stringify(d)), `${label}: not deterministic`);
      assert.match(cardSvgString(d, "front"), /^<\?xml/);
    }
  });
}

test("details: empty fields hidden, no logo -> monogram, logo -> image, website -> QR, brand colours replace the palette", () => {
  for (const t of CARD_TEMPLATES) {
    const min = buildDesign(t, INPUTS.minimal!);
    const texts = [...min.front.elements, ...min.back!.elements].filter((e): e is Extract<CardElement, { type: "text" }> => e.type === "text").map((e) => e.text);
    assert.ok(texts.every((x) => x.trim() && !/undefined|null/.test(x)), `${t.id}: ${texts}`);
    assert.ok(!min.front.elements.concat(min.back!.elements).some((e) => e.type === "qr"), `${t.id}: no website -> no QR`);
    const mono = buildDesign(t, INPUTS.nologo!);
    const all = (d: CardDesign) => [...d.front.elements, ...d.back!.elements];
    assert.ok(all(mono).some((e) => e.type === "text" && e.text === "SK"), `${t.id}: monogram initials`);
    assert.ok(!all(mono).some((e) => e.type === "image"));
    assert.ok(all(mono).some((e) => e.type === "qr" && e.value === "https://khan.ae"), `${t.id}: QR from website`);
    const lg = buildDesign(t, INPUTS.logo!);
    assert.ok(all(lg).some((e) => e.type === "image" && e.src === PNG), `${t.id}: logo shown`);
    assert.ok(!all(lg).some((e) => e.type === "text" && e.text === "SK"), `${t.id}: no monogram when a logo exists`);
  }
  const t = CARD_TEMPLATES[0]!;
  assert.equal(resolvePalette(t, INPUTS.brand!).primary, "#7c3aed");
  assert.equal(resolvePalette(t, INPUTS.minimal!), t.palette);
  assert.equal(resolvePalette(t, { name: "x", colors: ["#abc"] }).primary, "#aabbcc");
});

test("arabic: Cairo/Tajawal and right (or centre) aligned", () => {
  for (const t of CARD_TEMPLATES) {
    const d = buildDesign(t, INPUTS.arabic!);
    for (const e of [...d.front.elements, ...d.back!.elements]) if (e.type === "text" && /[؀-ۿ]/.test(e.text)) {
      assert.ok(["Cairo", "Tajawal"].includes(e.fontFamily), `${t.id}: ${e.fontFamily}`);
      assert.notEqual(e.align, "left", `${t.id}: arabic text left aligned: ${e.text}`);
      assert.ok(!e.letterSpacing, `${t.id}: letter-spacing breaks arabic joining`);
    }
  }
});

test("long names wrap or shrink inside the card (80 characters)", () => {
  for (const t of CARD_TEMPLATES) {
    const d = buildDesign(t, INPUTS.long80!);
    const name = [...d.front.elements, ...d.back!.elements].find((e) => e.type === "text" && e.text.replace(/\n/g, " ").toLowerCase().startsWith("abdulrahman"));
    assert.ok(name && name.type === "text", `${t.id}: name present`);
    if (name?.type === "text") assert.ok(name.text.split("\n").length <= 3 && name.fontSize >= 6, `${t.id}`);
  }
});

test("brand colours keep text readable even for awkward colours", () => {
  for (const t of CARD_TEMPLATES) for (const key of ["brand", "brandDark", "brandNavy"]) {
    const d = buildDesign(t, INPUTS[key]!);
    checkSide(`${t.id} ${key} front`, d.front, 85, 55); checkSide(`${t.id} ${key} back`, d.back!, 85, 55);
  }
});

test("recommend / templateDesigns pick by industry and style", () => {
  assert.equal(detectIndustry({ industry: "Law & finance" }), "law");
  assert.equal(detectIndustry({ company: "Joy Bakery" }), "food");
  assert.equal(detectIndustry({ company: "Acme" }), null);
  const law = recommend({ name: "x", industry: "law" }, 85, 55, 3);
  assert.equal(law.length, 3);
  assert.ok(law[0]!.industry === "law");
  assert.equal(new Set(law.map((t) => t.layout)).size, 3);
  const lux = templateDesigns({ name: "Ana", style: "luxury" }, { count: 3 });
  assert.ok(lux.length === 3 && lux.every((d) => d.back));
  const portrait = recommend({ name: "x" }, 55, 85, 6);
  assert.ok(portrait.every((t) => fitsOrientation(t, 55, 85)));
  assert.equal(paletteFor({ name: "x", industry: "law" }).primary, "#0f2a4a");
});
