import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const BRAND = path.join(process.cwd(), "public", "brand");
const APP = path.join(process.cwd(), "src", "app");
/** PNG header: width, height, colour type (6 = RGBA) */
const png = (f: string) => { const b = readFileSync(f); return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), colour: b[25] }; };

test("every logo file the Logo component can reference exists with the right size", () => {
  const sets: Record<string, number[]> = { horizontal: [240, 480, 960], stacked: [320, 640], signature: [280, 560] };
  const ratio: Record<string, number> = { horizontal: 1200 / 287, stacked: 1024 / 876, signature: 840 / 123 };
  for (const [name, widths] of Object.entries(sets)) for (const dark of ["", "-dark"]) for (const w of widths) {
    for (const ext of ["png", "webp"]) assert.ok(existsSync(path.join(BRAND, `${name}${dark}-${w}.${ext}`)), `${name}${dark}-${w}.${ext}`);
    const p = png(path.join(BRAND, `${name}${dark}-${w}.png`));
    assert.equal(p.w, w); assert.ok(Math.abs(p.h - w / ratio[name]) <= 1, `${name} aspect`); assert.equal(p.colour, 6, `${name} keeps transparency`);
  }
  for (const s of [64, 128, 256, 512]) { const p = png(path.join(BRAND, `mark-${s}.png`)); assert.deepEqual([p.w, p.h], [s, s]); }
});

test("icons, manifest icons and social images exist at the declared sizes", () => {
  assert.deepEqual([png(path.join(APP, "icon.png")).w, png(path.join(APP, "icon.png")).h], [512, 512]);
  assert.deepEqual([png(path.join(APP, "apple-icon.png")).w, png(path.join(APP, "apple-icon.png")).h], [180, 180]);
  for (const f of ["opengraph-image.png", "twitter-image.png"]) { const p = png(path.join(APP, f)); assert.deepEqual([p.w, p.h], [1200, 630]); }
  for (const [f, s] of [["icon-192.png", 192], ["icon-512.png", 512], ["icon-maskable-512.png", 512]] as const) { const p = png(path.join(BRAND, f)); assert.deepEqual([p.w, p.h], [s, s]); }
  assert.ok(readFileSync(path.join(APP, "favicon.ico")).length > 200);
  assert.ok(!existsSync(path.join(APP, "icon.tsx")) && !existsSync(path.join(APP, "opengraph-image.tsx")), "generated placeholder icons are gone");
});
