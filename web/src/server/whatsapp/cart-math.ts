/** Pure chat-cart logic (no DB, no server-only) so it is unit-testable and importable from the schema types. */
import { z } from "zod";

export const MAX_CART_ITEMS = 10;

export interface WaCartItem {
  slug: string; name: string; quantity: number; pages: number;
  selections: Record<string, string>; labels: Record<string, string>;
  unitPriceAed: number; subtotalAed: number;
}

/** Tool-call arguments are untrusted (they are model output derived from customer text): validate strictly. */
export const AddToCartInput = z.object({
  product_slug: z.string().min(1).max(80).regex(/^[a-z0-9-]+$/),
  quantity: z.number().int().min(1).max(1_000_000),
  pages: z.number().int().min(1).max(10_000).optional(),
  selections: z.record(z.string().max(40), z.string().max(60)).optional()
    .refine((s) => !s || Object.keys(s).length <= 20, "too many options"),
});
export const RemoveInput = z.object({ index: z.number().int().min(1).max(MAX_CART_ITEMS) });
export type AddToCartArgs = z.infer<typeof AddToCartInput>;

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export const aed = (n: number) => `AED ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function cartTotals(items: Pick<WaCartItem, "subtotalAed">[], vatRate: number, pricesIncludeVat: boolean) {
  const subtotal = r2(items.reduce((a, i) => a + i.subtotalAed, 0));
  const vat = pricesIncludeVat ? r2(subtotal - subtotal / (1 + vatRate / 100)) : r2(subtotal * (vatRate / 100));
  const total = pricesIncludeVat ? subtotal : r2(subtotal + vat);
  return { subtotal, vat, total };
}

/** Same `?cfg=` prefill the storefront product page reads (base64url JSON {selections, quantity, pages}). */
export function cfgLink(appUrl: string, tenantSlug: string, i: Pick<WaCartItem, "slug" | "selections" | "quantity" | "pages">) {
  const cfg = Buffer.from(JSON.stringify({ selections: i.selections ?? {}, quantity: i.quantity, pages: i.pages ?? 1 })).toString("base64url");
  return `${appUrl}/s/${tenantSlug}/p/${i.slug}?cfg=${cfg}`;
}

export function describeItem(i: WaCartItem) {
  const opts = Object.values(i.labels ?? {}).filter(Boolean).slice(0, 3).join(" · ");
  return `${i.quantity.toLocaleString("en-US")} × ${i.name}${i.pages > 1 ? ` (${i.pages} pages)` : ""}${opts ? ` — ${opts}` : ""}`;
}

/** Short itemised list used by view_cart / after add_to_cart. */
export function formatCartSummary(items: WaCartItem[], vatRate: number, pricesIncludeVat: boolean) {
  if (!items.length) return "Your cart is empty.";
  const t = cartTotals(items, vatRate, pricesIncludeVat);
  const lines = items.map((i, n) => `${n + 1}. ${describeItem(i)} — ${aed(i.subtotalAed)}`);
  return [`🛒 Your cart`, ...lines, `Subtotal ${aed(t.subtotal)} · VAT ${vatRate}% ${pricesIncludeVat ? "included" : aed(t.vat)} · Total ${aed(t.total)} (delivery not included)`].join("\n");
}

/** The ONE checkout message: itemised cart, totals, and one storefront link per line. Files, slots and payment happen on the links — never in chat. */
export function formatCheckoutMessage(opts: { shopName: string; items: WaCartItem[]; vatRate: number; pricesIncludeVat: boolean; appUrl: string; tenantSlug: string }) {
  const { items, vatRate, pricesIncludeVat } = opts;
  if (!items.length) return "Your cart is empty — tell me what you'd like to print.";
  const t = cartTotals(items, vatRate, pricesIncludeVat);
  const lines = items.flatMap((i, n) => [`${n + 1}. ${describeItem(i)} — ${aed(i.subtotalAed)}`, `   ${cfgLink(opts.appUrl, opts.tenantSlug, i)}`]);
  return [
    `🛒 Your cart — ${opts.shopName}`, ...lines,
    `Subtotal: ${aed(t.subtotal)}`,
    pricesIncludeVat ? `VAT ${vatRate}%: included in prices` : `VAT ${vatRate}%: ${aed(t.vat)}`,
    `Total (estimate): ${aed(t.total)} — delivery not included`,
    `Open each link to choose options, upload your files, pick pickup or delivery and pay online (card / Apple Pay / Google Pay). Cash on delivery is not available.`,
  ].join("\n");
}

export const BUTTONS = { confirm: "cart:confirm", edit: "cart:edit", human: "human" } as const;
export const CONFIRM_BUTTONS = [
  { id: BUTTONS.confirm, title: "Confirm cart" },
  { id: BUTTONS.edit, title: "Change something" },
  { id: BUTTONS.human, title: "Talk to a human" },
];

/** Untrusted customer text is data: neutralise control characters / zero-width and cap length before it reaches the model. */
export function sanitizeCustomerText(t: string, max = 1500) {
  return t.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁦-⁩﻿]/g, "").slice(0, max).trim();
}
