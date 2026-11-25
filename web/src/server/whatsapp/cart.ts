import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Tenant } from "@/db/schema";
import { env } from "@/lib/env";
import { quotePrice } from "./tools";
import { AddToCartInput, MAX_CART_ITEMS, cfgLink, RemoveInput, formatCartSummary, formatCheckoutMessage, type WaCartItem } from "./cart-math";

/** Where a chat's cart lives: the conversation row (real chats) or memory (admin test chat). */
export interface CartStore { get(): Promise<WaCartItem[]>; set(items: WaCartItem[]): Promise<void> }

export const dbCartStore = (conversationId: string): CartStore => ({
  async get() { return (await db.query.whatsappConversations.findFirst({ where: eq(schema.whatsappConversations.id, conversationId) }))?.cart ?? []; },
  async set(items) { await db.update(schema.whatsappConversations).set({ cart: items }).where(eq(schema.whatsappConversations.id, conversationId)); },
});
export const memoryCartStore = (initial: WaCartItem[] = []): CartStore & { items: WaCartItem[] } => {
  const s = { items: [...initial], async get() { return s.items; }, async set(i: WaCartItem[]) { s.items = i; } };
  return s;
};

const vat = (t: Tenant) => ({ rate: t.settings.vatRate ?? 5, incl: !!t.settings.pricesIncludeVat });

/** Prices come ONLY from the pricing engine (quotePrice → computeLinePrice). Unknown product / bad option / bad quantity are rejected. */
export async function addToCart(tenant: Tenant, store: CartStore, rawArgs: unknown) {
  const a = AddToCartInput.safeParse(rawArgs);
  if (!a.success) return { ok: false as const, error: "Invalid arguments: " + a.error.issues[0]?.message };
  const items = await store.get();
  if (items.length >= MAX_CART_ITEMS) return { ok: false as const, error: `The cart is full (max ${MAX_CART_ITEMS} items). Remove one first.` };
  const q = await quotePrice(tenant, { product_slug: a.data.product_slug, quantity: a.data.quantity, pages: a.data.pages, selections: a.data.selections });
  if (!q.ok) return q;
  const item: WaCartItem = { slug: q.slug, name: q.product, quantity: q.quantity, pages: q.pages, selections: a.data.selections ?? {}, labels: q.chosen_options, unitPriceAed: q.unit_price_aed, subtotalAed: q.subtotal_aed };
  const next = [...items, item];
  await store.set(next);
  const v = vat(tenant);
  return { ok: true as const, added: item, item_count: next.length, summary: formatCartSummary(next, v.rate, v.incl) };
}

export async function viewCart(tenant: Tenant, store: CartStore) {
  const items = await store.get(); const v = vat(tenant);
  return { ok: true as const, item_count: items.length, items, summary: formatCartSummary(items, v.rate, v.incl) };
}

export async function removeFromCart(tenant: Tenant, store: CartStore, rawArgs: unknown) {
  const a = RemoveInput.safeParse(rawArgs);
  if (!a.success) return { ok: false as const, error: "Invalid index" };
  const items = await store.get();
  if (a.data.index > items.length) return { ok: false as const, error: `There is no item ${a.data.index} in the cart.` };
  const next = items.filter((_, i) => i !== a.data.index - 1);
  await store.set(next); const v = vat(tenant);
  return { ok: true as const, item_count: next.length, summary: formatCartSummary(next, v.rate, v.incl) };
}

export async function clearCart(store: CartStore) { await store.set([]); return { ok: true as const, item_count: 0 }; }

/** Re-price a cart that came from an untrusted place (the admin test-chat client). */
export async function repriceCart(tenant: Tenant, items: unknown): Promise<WaCartItem[]> {
  const out: WaCartItem[] = [];
  if (!Array.isArray(items)) return out;
  const store = memoryCartStore();
  for (const raw of items.slice(0, MAX_CART_ITEMS)) {
    const r = raw as { slug?: string; quantity?: number; pages?: number; selections?: Record<string, string> };
    const res = await addToCart(tenant, store, { product_slug: r?.slug, quantity: r?.quantity, pages: r?.pages, selections: r?.selections });
    if (res.ok) out.push(res.added);
  }
  return out;
}

/** The single checkout message: itemised cart + totals + one prefilled storefront link per line. */
export async function checkoutMessage(tenant: Tenant, store: CartStore) {
  const items = await store.get(); const v = vat(tenant);
  const message = formatCheckoutMessage({ shopName: tenant.name, items, vatRate: v.rate, pricesIncludeVat: v.incl, appUrl: env.appUrl, tenantSlug: tenant.slug });
  const links = items.map((i) => cfgLink(env.appUrl, tenant.slug, i));
  return { ok: items.length > 0, message, item_count: items.length, links };
}
