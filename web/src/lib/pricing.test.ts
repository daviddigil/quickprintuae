import { test } from "node:test";
import assert from "node:assert/strict";
import { computeLinePrice, computeOrderTotals, PricingError } from "./pricing";
import { DEFAULT_PRODUCTS } from "./catalog-defaults";

const doc = DEFAULT_PRODUCTS.find((p) => p.kind === "document")!.config;
const cards = DEFAULT_PRODUCTS.find((p) => p.kind === "business_card")!.config;

test("document: per-page tiers, colour add-on, double-sided multiplier, binding flat fee", () => {
  // 10 copies × 12 pages = 120 units -> tier 0.40; colour +0.75 => 1.15; double ×1.6 => 1.84; spiral +10
  const r = computeLinePrice(doc, { paper_size: "A4", color: "color", sides: "double", binding: "spiral" }, 10, 12);
  assert.equal(r.units, 120);
  assert.equal(r.unitPrice, 1.84);
  assert.equal(r.setupFees, 10);
  assert.equal(r.lineTotal, 230.8);
});

test("defaults apply when selections omitted", () => {
  const r = computeLinePrice(doc, {}, 1, 1);
  assert.equal(r.lineTotal, 0.5);
  assert.equal(r.labels.paper_size, "A4 (210 × 297 mm)");
});

test("rejects invalid options and quantities", () => {
  assert.throws(() => computeLinePrice(doc, { paper_size: "B9" }, 1, 1), PricingError);
  assert.throws(() => computeLinePrice(doc, {}, 0, 1), PricingError);
  assert.throws(() => computeLinePrice(cards, {}, 123), PricingError); // not a preset
});

test("business cards 500 pcs, soft-touch ×1.5, gold foil flat", () => {
  const r = computeLinePrice(cards, { stock: "400softtouch", card_finish: "gold" }, 500);
  assert.equal(r.unitPrice, 0.36);
  assert.equal(r.lineTotal, 270);
});

test("VAT 5% exclusive and inclusive", () => {
  assert.deepEqual(computeOrderTotals([100, 50], 15, 5, false), { subtotal: 150, deliveryFee: 15, discount: 0, vat: 8.25, total: 173.25 });
  const inc = computeOrderTotals([105], 0, 5, true);
  assert.equal(inc.vat, 5);
  assert.equal(inc.total, 105);
});

import { PERSONALISATION_PREFIX } from "./types";
test("personalisation: required, max length and flat fee", () => {
  const cfg = {
    tiers: [{ min: 1, unitPrice: 20 }], optionGroups: [],
    personalisation: { artwork: "optional" as const, fields: [
      { key: "name", label: "Name on mug", type: "text" as const, maxLength: 10, required: true },
      { key: "msg", label: "Message", type: "textarea" as const, maxLength: 30, flat: 5 },
    ] },
  };
  assert.throws(() => computeLinePrice(cfg, {}, 1), /Name on mug/);
  assert.throws(() => computeLinePrice(cfg, { [PERSONALISATION_PREFIX + "name"]: "x".repeat(11) }, 1), /at most 10/);
  const ok = computeLinePrice(cfg, { [PERSONALISATION_PREFIX + "name"]: " Sara " }, 2);
  assert.equal(ok.lineTotal, 40); assert.equal(ok.labels[PERSONALISATION_PREFIX + "name"], "Sara");
  const withMsg = computeLinePrice(cfg, { [PERSONALISATION_PREFIX + "name"]: "Sara", [PERSONALISATION_PREFIX + "msg"]: "Happy birthday" }, 2);
  assert.equal(withMsg.lineTotal, 45);
});

import { ALL_TEMPLATES, MERCH_TEMPLATES } from "./catalog-defaults";
test("every template (print + merchandise + gifts) prices with its defaults and has unique slugs", () => {
  assert.equal(new Set(ALL_TEMPLATES.map((t) => t.slug)).size, ALL_TEMPLATES.length);
  for (const t of ALL_TEMPLATES) {
    const sel: Record<string, string> = {};
    for (const g of t.config.optionGroups) if (g.default) sel[g.key] = g.default;
    const qty = Math.max(1, t.config.minQuantity ?? 1, t.config.quantityPresets?.[0] ?? 1);
    const r = computeLinePrice(t.config, sel, qty, 1);
    assert.ok(r.lineTotal > 0, `${t.slug} prices above zero`);
    for (const g of t.config.optionGroups) if (g.default) assert.ok(g.choices.some((c) => c.value === g.default), `${t.slug}.${g.key} default is a choice`);
    for (const f of t.config.personalisation?.fields ?? []) assert.ok(f.maxLength > 0 && /^[a-z0-9_]+$/.test(f.key), `${t.slug} field ${f.key}`);
  }
  assert.ok(MERCH_TEMPLATES.length >= 15);
  for (const t of MERCH_TEMPLATES) assert.ok(t.category, `${t.slug} has a category`);
});
