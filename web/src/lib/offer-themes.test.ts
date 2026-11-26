import { test } from "node:test";
import assert from "node:assert/strict";
import { THEME_PRESETS, THEME_STYLES, fromDubaiInput, toDubaiInput } from "./offer-themes";
import { OFFER_THEMES } from "./offers";

const lum = (h: string) => { const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const contrast = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

test("every theme has AA text contrast (text on background, label on accent)", () => {
  for (const t of OFFER_THEMES) { const s = THEME_STYLES[t]; assert.ok(contrast(s.fg, s.bg) >= 4.5, `${t} text`); assert.ok(contrast(s.onAccent, s.accent) >= 4.5, `${t} button`); }
});
test("presets give a future window and round-trip Dubai time", () => {
  const from = new Date("2026-11-26T10:00:00Z");
  for (const t of OFFER_THEMES) { const w = THEME_PRESETS[t].window(from); assert.ok(w.endsAt > w.startsAt, t); assert.ok(w.endsAt > from, t); }
  const bf = THEME_PRESETS.black_friday.window(from);
  assert.equal(toDubaiInput(bf.startsAt), "2026-11-24T00:00"); // Black Friday 2026 is 27 Nov; window opens 3 days before
  assert.equal(fromDubaiInput("2026-11-25T00:00")!.toISOString(), "2026-11-24T20:00:00.000Z");
  assert.equal(fromDubaiInput(""), null);
});
