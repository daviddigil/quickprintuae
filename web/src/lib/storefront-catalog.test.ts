import { test } from "node:test";
import assert from "node:assert/strict";
import { activeTier, categoryOf, cleanSelections, estimateSelections, groupByCategory, missingPersonalisation, needsPersonalisation, personalisationLines, resolveCategory, splitLabel, tierRows } from "./storefront-catalog";
import type { ProductConfig } from "./types";

test("groupByCategory: null category is Print, order kept, featured first", () => {
  const g = groupByCategory([{ id: 1, category: null }, { id: 2, category: "Mugs" }, { id: 3, category: "  " }, { id: 4, category: "Mugs", featured: true }]);
  assert.deepEqual(g.map((x) => x.name), ["Print", "Mugs"]);
  assert.deepEqual(g[0].products.map((p) => p.id), [1, 3]);
  assert.deepEqual(g[1].products.map((p) => p.id), [4, 2]);
  assert.equal(categoryOf({ category: undefined }), "Print");
});

test("resolveCategory matches case-insensitively and ignores unknown values", () => {
  const g = [{ name: "Print" }, { name: "Mugs" }];
  assert.equal(resolveCategory(g, "mugs"), "Mugs");
  assert.equal(resolveCategory(g, ["Print", "x"]), "Print");
  assert.equal(resolveCategory(g, "nope"), null);
  assert.equal(resolveCategory(g, undefined), null);
});

test("tierRows: ranges, savings, hides single/identical tiers and per-page products", () => {
  const rows = tierRows({ tiers: [{ min: 48, unitPrice: 19 }, { min: 1, unitPrice: 30 }, { min: 12, unitPrice: 24 }] });
  assert.deepEqual(rows.map((r) => [r.min, r.max, r.unitPrice, r.savePct]), [[1, 11, 30, 0], [12, 47, 24, 20], [48, null, 19, 37]]);
  assert.equal(activeTier(rows, 11).min, 1); assert.equal(activeTier(rows, 12).min, 12); assert.equal(activeTier(rows, 500).min, 48);
  assert.deepEqual(tierRows({ tiers: [{ min: 1, unitPrice: 5 }, { min: 10, unitPrice: 5 }] }), []);
  assert.deepEqual(tierRows({ tiers: [{ min: 1, unitPrice: 5 }] }), []);
  assert.deepEqual(tierRows({ perPage: true, tiers: [{ min: 1, unitPrice: 5 }, { min: 10, unitPrice: 4 }] }), []);
});

const cfg: Pick<ProductConfig, "personalisation"> = { personalisation: { artwork: "optional", fields: [
  { key: "name", label: "Name on mug", type: "text", maxLength: 10, required: true }, { key: "msg", label: "Message", type: "textarea", maxLength: 30, flat: 5 },
] } };

test("personalisation helpers", () => {
  assert.equal(needsPersonalisation(cfg), true);
  assert.equal(needsPersonalisation({ personalisation: { artwork: "required", fields: [] } }), true);
  assert.equal(needsPersonalisation({ personalisation: { artwork: "optional", fields: [{ key: "a", label: "A", type: "text", maxLength: 5 }] } }), false);
  assert.equal(needsPersonalisation({}), false);
  assert.deepEqual(missingPersonalisation(cfg, { p_name: "  " }).map((f) => f.key), ["name"]);
  assert.deepEqual(missingPersonalisation(cfg, { p_name: "Sara" }), []);
  assert.deepEqual(estimateSelections(cfg, { size: "m", p_msg: " " }), { size: "m", p_name: "-" });
  assert.deepEqual(cleanSelections(cfg, { size: "m", p_name: " Sara ", p_msg: "  " }), { size: "m", p_name: "Sara" });
  assert.deepEqual(personalisationLines(cfg, { p_name: " Sara " }), ["Name on mug: Sara"]);
  assert.deepEqual(splitLabel("p_name", "Name on mug: Sara: x"), ["Name on mug", "Sara: x"]);
  assert.deepEqual(splitLabel("print_position", "Front"), ["print position", "Front"]);
});

import { productLd } from "./seo/jsonld";
test("productLd lists every gallery image (cover first, deduplicated); one image stays a string", () => {
  const base = { url: "u", name: "n", description: "d", shopId: "i", shopName: "s", lowPrice: 5, vatIncluded: false };
  assert.deepEqual(productLd({ ...base, image: ["https://x/1.jpg", "https://x/2.jpg", "https://x/1.jpg"] }).image, ["https://x/1.jpg", "https://x/2.jpg"]);
  assert.equal(productLd({ ...base, image: "https://x/1.jpg" }).image, "https://x/1.jpg");
  assert.equal(productLd({ ...base }).image, undefined);
});
