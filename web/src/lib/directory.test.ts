import { test } from "node:test";
import assert from "node:assert/strict";
import { areasWithShops, countBy, filterShops, type DirectoryShop } from "./directory";
import { AREAS } from "./areas";
import { EMIRATES } from "./types";

const shop = (o: Partial<DirectoryShop>): DirectoryShop => ({ slug: "a", name: "A", url: "https://x", logoUrl: null, color: "#3300ff", emirate: "Dubai", area: null, address: null, hours: null, phone: null, whatsapp: null, ...o });
const shops = [
  shop({ slug: "1", name: "Barsha Print", emirate: "Dubai", area: "Al Barsha", address: "Street 5" }),
  shop({ slug: "2", name: "Deira Copy", emirate: "Dubai", area: "Deira" }),
  shop({ slug: "3", name: "Majaz Press", emirate: "Sharjah", area: "Al Majaz" }),
];

test("filters by emirate, area and search (case-insensitive)", () => {
  assert.equal(filterShops(shops, {}).length, 3);
  assert.deepEqual(filterShops(shops, { emirate: "Dubai" }).map((s) => s.slug), ["1", "2"]);
  assert.deepEqual(filterShops(shops, { emirate: "Dubai", area: "deira" }).map((s) => s.slug), ["2"]);
  assert.deepEqual(filterShops(shops, { q: "street 5" }).map((s) => s.slug), ["1"]);
  assert.equal(filterShops(shops, { emirate: "Ajman" }).length, 0);
});
test("counts per emirate and areas that really have shops", () => {
  assert.deepEqual(countBy(shops, (s) => s.emirate), { Dubai: 2, Sharjah: 1 });
  assert.deepEqual(areasWithShops(shops, "Dubai"), ["Al Barsha", "Deira"]);
  assert.deepEqual(areasWithShops(shops), ["Al Barsha", "Al Majaz", "Deira"]);
});
test("area list covers every emirate with unique names", () => {
  for (const e of EMIRATES) { assert.ok(AREAS[e]?.length, e); assert.equal(new Set(AREAS[e]).size, AREAS[e].length, e); }
});
