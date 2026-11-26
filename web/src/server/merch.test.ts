/** DB-backed tests for merchandise ordering: server-side personalisation checks, artwork required, no `internal` leak, chat cart redirect. Run via `npm test`. */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { createDb } from "@/db/client";
import { provisionTenant } from "@/server/provision";
import { CheckoutError, createOrder, deliverySettings, type CheckoutInputT } from "@/server/checkout";
import { generateSlots } from "@/lib/slots";
import { MERCH_TEMPLATES } from "@/lib/catalog-defaults";
import type { ProductConfig } from "@/lib/types";
import { storefrontColumns } from "@/server/storefront-products";
import { addToCart, memoryCartStore } from "@/server/whatsapp/cart";
import { listProducts, quotePrice } from "@/server/whatsapp/tools";

const suffix = Date.now().toString(36);
const created: string[] = [];
after(async () => { for (const id of created) await db.delete(schema.tenants).where(eq(schema.tenants.id, id)); });

const MUG: ProductConfig = {
  acceptedFiles: ".png,.jpg,.svg,.pdf",
  tiers: [{ min: 1, unitPrice: 30 }, { min: 12, unitPrice: 25 }],
  optionGroups: [],
  personalisation: { artwork: "required", fields: [{ key: "name", label: "Name", type: "text", maxLength: 10, required: true }] },
  mockup: { enabled: true, x: 20, y: 20, w: 50, h: 40 },
};

async function shop() {
  const { tenant: t } = await provisionTenant(createDb().db, { shopName: `M ${suffix}`, slug: `m${suffix}${created.length}`, ownerName: "O", ownerEmail: `o${created.length}${suffix}@t.ae`, ownerPassword: "pw123456", planCode: "growth", verified: true });
  created.push(t.id);
  const settings = { ...t.settings, payments: { stripe: { enabled: true, secretKeyEnc: "x" } } };
  const [tenant] = await db.update(schema.tenants).set({ settings: settings as never }).where(eq(schema.tenants.id, t.id)).returning();
  const [pickup] = await db.insert(schema.pickupLocations).values({ tenantId: t.id, name: "Shop", address: "Main St", emirate: "Dubai" }).returning();
  const [product] = await db.insert(schema.products).values({ tenantId: t.id, kind: "merchandise", name: "Mug", slug: "mug", category: "Mugs", config: MUG, internal: { costPrice: 7, note: "supplier secret" } }).returning();
  const optional = MERCH_TEMPLATES.find((p) => p.slug === "printed-mug")!;
  await db.insert(schema.products).values({ tenantId: t.id, kind: optional.kind, name: optional.name, slug: optional.slug, category: optional.category, config: optional.config });
  return { tenant, pickup, product };
}
async function artFile(tenantId: string) {
  const [f] = await db.insert(schema.files).values({ tenantId, filename: "logo.png", storageKey: `k/${Math.random()}`, mime: "image/png", size: 10 }).returning();
  return f;
}
async function input(t: Awaited<ReturnType<typeof shop>>, line: Partial<CheckoutInputT["lines"][number]>): Promise<CheckoutInputT> {
  const slot = generateSlots(deliverySettings(t.tenant), 72)[0].slots[0];
  return {
    contact: { name: "Aisha Test", email: "a@example.com", phone: "0501234567" },
    lines: [{ productId: t.product.id, quantity: 1, pages: 1, selections: {}, fileIds: [], ...line }],
    fulfillment: "pickup", pickupLocationId: t.pickup.id, slotStart: slot.start, provider: "stripe",
  };
}
const rejects = (p: Promise<unknown>, re: RegExp) => assert.rejects(p, (e: Error) => e instanceof CheckoutError && re.test(e.message));

test("server rejects missing/too-long personalisation and missing required artwork, accepts a valid order with readable labels", async () => {
  const t = await shop();
  const f = await artFile(t.tenant.id);
  await rejects(createOrder(t.tenant, await input(t, { fileIds: [f.id] }), null), /Please fill in Name/);
  await rejects(createOrder(t.tenant, await input(t, { selections: { p_name: "   " }, fileIds: [f.id] }), null), /Please fill in Name/);
  await rejects(createOrder(t.tenant, await input(t, { selections: { p_name: "x".repeat(11) }, fileIds: [f.id] }), null), /at most 10/);
  await rejects(createOrder(t.tenant, await input(t, { selections: { p_name: "Sara" } }), null), /upload your artwork/);
  const order = await createOrder(t.tenant, await input(t, { selections: { p_name: " Sara " }, fileIds: [f.id], quantity: 12 }), null);
  const [item] = await db.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, order.id));
  assert.equal(item.selectionLabels.p_name, "Name: Sara");
  assert.equal(item.unitPrice, 25); assert.deepEqual(item.fileIds, [f.id]);
});

test("storefront queries never return the internal column", async () => {
  const t = await shop();
  assert.ok(!("internal" in storefrontColumns));
  const [row] = await db.select(storefrontColumns).from(schema.products).where(and(eq(schema.products.tenantId, t.tenant.id), eq(schema.products.slug, "mug")));
  assert.ok(!("internal" in row));
  assert.ok(!JSON.stringify(row).includes("supplier secret"));
  const [full] = await db.select().from(schema.products).where(eq(schema.products.id, row.id));
  assert.equal(full.internal.costPrice, 7, "the owner side still has it");
});

test("WhatsApp: items that need personalisation or artwork are priced but never added to the chat cart", async () => {
  const t = await shop(); const cart = memoryCartStore();
  const q = await quotePrice(t.tenant, { product_slug: "mug", quantity: 12 });
  assert.equal(q.ok, true);
  if (q.ok) { assert.equal(q.unit_price_aed, 25); assert.equal("needs_website" in q && q.needs_website, true); }
  const r = await addToCart(t.tenant, cart, { product_slug: "mug", quantity: 1 });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(String(r.error), /personalisation.*order it on the website: http.*\/s\/.*\/p\/mug/);
  assert.equal((await cart.get()).length, 0);
  const ok = await addToCart(t.tenant, cart, { product_slug: "printed-mug", quantity: 1 }); // optional personalisation is fine in chat
  assert.equal(ok.ok, true);
  const list = await listProducts(t.tenant);
  assert.equal(list.find((p) => p.slug === "mug")?.needs_personalisation_on_website, true);
  assert.equal(list.find((p) => p.slug === "printed-mug")?.needs_personalisation_on_website, false);
  assert.equal(list.find((p) => p.slug === "mug")?.category, "Mugs");
});
