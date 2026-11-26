import { test } from "node:test";
import assert from "node:assert/strict";
import { ConfigSchema, ProductBody, toColumns } from "./product-schema";
import { MERCH_TEMPLATES, DEFAULT_PRODUCTS } from "../lib/catalog-defaults";
import { fallbackDescription } from "../lib/product-description";
import { fitArea } from "../lib/print-area";

const base = { name: "Printed Mug", slug: "printed-mug", description: "", imageUrl: "", turnaroundHours: 48, active: false, featured: false, sortOrder: 0, config: { tiers: [{ min: 1, unitPrice: 29 }], optionGroups: [] } };
const ok = (v: unknown) => ProductBody.safeParse(v);
const field = { key: "name_text", label: "Name", type: "text", maxLength: 24 };

test("accepts a minimal product and every shipped template config", () => {
  assert.ok(ok(base).success);
  for (const t of [...DEFAULT_PRODUCTS, ...MERCH_TEMPLATES]) assert.ok(ConfigSchema.safeParse(t.config).success, `template ${t.slug}: ${JSON.stringify(ConfigSchema.safeParse(t.config).error?.issues)}`);
});

test("personalisation: keys unique and [a-z0-9_], maxLength 1..500, artwork enum", () => {
  const cfg = (personalisation: unknown) => ok({ ...base, config: { ...base.config, personalisation } });
  assert.ok(cfg({ fields: [field], artwork: "optional" }).success);
  assert.ok(!cfg({ fields: [field, field], artwork: "none" }).success, "duplicate keys");
  assert.ok(!cfg({ fields: [{ ...field, key: "Bad Key" }], artwork: "none" }).success, "bad key chars");
  assert.ok(!cfg({ fields: [{ ...field, maxLength: 0 }], artwork: "none" }).success, "maxLength 0");
  assert.ok(!cfg({ fields: [{ ...field, maxLength: 501 }], artwork: "none" }).success, "maxLength 501");
  assert.ok(cfg({ fields: [{ ...field, maxLength: 500 }], artwork: "none" }).success);
  assert.ok(!cfg({ fields: [field], artwork: "maybe" }).success, "artwork enum");
  assert.ok(!cfg({ fields: [{ ...field, flat: -1 }], artwork: "none" }).success, "negative fee");
});

test("mockup percentages stay within 0..100 and inside the photo", () => {
  const cfg = (mockup: unknown) => ok({ ...base, config: { ...base.config, mockup } });
  assert.ok(cfg({ enabled: true, x: 20, y: 25, w: 60, h: 50 }).success);
  assert.ok(!cfg({ enabled: true, x: -1, y: 0, w: 10, h: 10 }).success);
  assert.ok(!cfg({ enabled: true, x: 0, y: 0, w: 101, h: 10 }).success);
  assert.ok(!cfg({ enabled: true, x: 60, y: 0, w: 50, h: 10 }).success, "x+w > 100");
});

test("tiers, option keys and defaults are still validated", () => {
  assert.ok(!ok({ ...base, config: { tiers: [], optionGroups: [] } }).success);
  const g = { key: "size", label: "Size", type: "select", choices: [{ value: "s", label: "S" }] };
  assert.ok(!ok({ ...base, config: { ...base.config, optionGroups: [g, g] } }).success, "dup group keys");
  assert.ok(!ok({ ...base, config: { ...base.config, optionGroups: [{ ...g, default: "xl" }] } }).success, "bad default");
  assert.ok(!ok({ ...base, config: { ...base.config, optionGroups: [{ ...g, key: "Size!" }] } }).success);
});

test("images: uploaded or http(s) only, max 8; internal cost must be a non-negative number", () => {
  const up = "/api/product-images/11111111-1111-1111-1111-111111111111/2026-11/22222222-2222-2222-2222-222222222222.png";
  assert.ok(ok({ ...base, imageUrl: up, images: [up, "https://example.com/a.jpg"] }).success);
  assert.ok(!ok({ ...base, images: ["javascript:alert(1)"] }).success);
  assert.ok(!ok({ ...base, images: ["/etc/passwd"] }).success);
  assert.ok(!ok({ ...base, images: Array(9).fill(up) }).success);
  assert.ok(ok({ ...base, internal: { costPrice: 12.5, note: "supplier x" } }).success);
  assert.ok(!ok({ ...base, internal: { costPrice: -1 } }).success);
});

test("toColumns normalises category/internal and defaults kind separately", () => {
  const v = ok({ ...base, category: "  Mugs ", internal: { costPrice: 11, note: " " }, kind: "merchandise" });
  assert.ok(v.success);
  const c = toColumns(v.data);
  assert.equal(c.category, "Mugs"); assert.deepEqual(c.internal, { costPrice: 11 }); assert.equal(c.imageUrl, null); assert.equal(c.kind, "merchandise");
  const none = toColumns(ok(base).data!);
  assert.equal(none.category, null); assert.ok(!("internal" in none) && !("images" in none), "omitted fields are left untouched on PUT");
});

test("print-area helper keeps the rectangle inside the photo", () => {
  const a = fitArea({ enabled: true, x: 95, y: -5, w: 40, h: 200 });
  assert.ok(a.x + a.w <= 100 && a.y >= 0 && a.y + a.h <= 100);
});

test("description fallback is deterministic and mentions personalisation", () => {
  const t = fallbackDescription({ name: "Printed Mug", category: "Mugs", options: ["Size"], personalised: true });
  assert.match(t, /Printed Mug/); assert.match(t, /Add your own/);
  assert.equal(t, fallbackDescription({ name: "Printed Mug", category: "Mugs", options: ["Size"], personalised: true }));
});
