/** DB-backed: the rights declaration is required when the cart has an upload/design, and is stored with the order. Run via `npm test`. */
process.env.PAYMENTS_FAKE = "1";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { createDb } from "@/db/client";
import { provisionTenant } from "@/server/provision";
import { CheckoutError, createOrder, deliverySettings, type CheckoutInputT } from "@/server/checkout";
import { generateSlots } from "@/lib/slots";
import { RIGHTS_DECLARATION_VERSION } from "@/lib/compliance";
import { requiresRightsDeclaration } from "@/lib/rights-declaration";
import type { ProductConfig } from "@/lib/types";

const suffix = Date.now().toString(36);
let tenantId = "";
after(async () => { if (tenantId) await db.delete(schema.tenants).where(eq(schema.tenants.id, tenantId)); });

const CFG: ProductConfig = { acceptedFiles: ".pdf", tiers: [{ min: 1, unitPrice: 10 }], optionGroups: [] };

test("requiresRightsDeclaration: only carts with a file or a design", () => {
  assert.equal(requiresRightsDeclaration([{ fileIds: [] }]), false);
  assert.equal(requiresRightsDeclaration([{ fileIds: ["a"] }]), true);
  assert.equal(requiresRightsDeclaration([{ fileIds: [], design: { front: {} } }]), true);
  assert.equal(requiresRightsDeclaration([{}, { fileIds: ["x"] }]), true);
});

test("checkout: 400 rights_declaration_required without the declaration; stored with order + consent log when given", async () => {
  const { tenant: t } = await provisionTenant(createDb().db, { shopName: `Rd ${suffix}`, slug: `rd${suffix}`, ownerName: "O", ownerEmail: `rd${suffix}@t.ae`, ownerPassword: "pw123456", planCode: "growth", verified: true });
  tenantId = t.id;
  const [tenant] = await db.update(schema.tenants).set({ settings: { ...t.settings, payments: { stripe: { enabled: true, secretKeyEnc: "x" } } } as never }).where(eq(schema.tenants.id, t.id)).returning();
  const [pickup] = await db.insert(schema.pickupLocations).values({ tenantId: t.id, name: "Shop", address: "Main St", emirate: "Dubai" }).returning();
  const [product] = await db.insert(schema.products).values({ tenantId: t.id, kind: "document", name: "Prints", slug: "prints", category: "Docs", config: CFG }).returning();
  const [file] = await db.insert(schema.files).values({ tenantId: t.id, filename: "a.pdf", storageKey: `k/${Math.random()}`, mime: "application/pdf", size: 10 }).returning();
  const slot = generateSlots(deliverySettings(tenant), 72)[0].slots[0];
  const base = (over: Partial<CheckoutInputT["lines"][number]> = {}, extra: Partial<CheckoutInputT> = {}): CheckoutInputT => ({
    contact: { name: "Aisha Test", email: "a@example.com", phone: "0501234567" },
    lines: [{ productId: product.id, quantity: 1, pages: 1, selections: {}, fileIds: [], ...over }],
    fulfillment: "pickup", pickupLocationId: pickup.id, slotStart: slot.start, provider: "stripe", ...extra,
  });

  // no upload: no declaration needed, nothing stored
  const plain = await createOrder(tenant, base(), null);
  assert.equal(plain.rightsDeclaredAt, null);

  // upload without the declaration: rejected with the stable code, no order created
  const before = (await db.select().from(schema.orders).where(eq(schema.orders.tenantId, t.id))).length;
  for (const extra of [{}, { rightsDeclared: false }]) {
    await assert.rejects(createOrder(tenant, base({ fileIds: [file.id] }, extra), null), (e: Error) => e instanceof CheckoutError && e.status === 400 && (e as CheckoutError).code === "rights_declaration_required");
  }
  assert.equal((await db.select().from(schema.orders).where(eq(schema.orders.tenantId, t.id))).length, before);

  // with the declaration: stored on the order and logged
  const order = await createOrder(tenant, base({ fileIds: [file.id] }, { rightsDeclared: true }), null);
  assert.ok(order.rightsDeclaredAt);
  assert.equal(order.rightsDeclarationVersion, RIGHTS_DECLARATION_VERSION);
  const logs = await db.select().from(schema.consentLogs).where(eq(schema.consentLogs.tenantId, t.id));
  assert.equal(logs.length, 1);
  assert.equal(logs[0].purpose, "rights_declaration");
  assert.equal(logs[0].granted, true);
  assert.equal(logs[0].version, RIGHTS_DECLARATION_VERSION);
});
