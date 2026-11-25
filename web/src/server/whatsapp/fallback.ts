import "server-only";
import type { Tenant } from "@/db/schema";
import { activeProducts, matchProduct, quotePrice, sendCheckoutLink } from "./tools";
import { addToCart, checkoutMessage, clearCart, removeFromCart, viewCart } from "./cart";
import { sanitizeCustomerText } from "./cart-math";
import type { AgentContext, AgentResult } from "./agent";

/** Splits "500 business cards and 100 flyers, 2,000 posters" into segments (keeps thousands separators intact). */
export function splitItems(text: string): string[] {
  return text.replace(/(\d),(\d{3})\b/g, "$1$2").split(/\s*(?:,|&|\+|\band\b|\bplus\b|\bwith\b)\s*/i).map((s) => s.trim()).filter(Boolean);
}

/** Deterministic replies used when ANTHROPIC_API_KEY is unset. Same chat-cart flows as the AI: menu, quote, add, cart, checkout, remove, clear, human. */
export async function ruleBasedReply(tenant: Tenant, rawText: string, ctx: AgentContext): Promise<AgentResult> {
  const text = sanitizeCustomerText(rawText);
  const t = text.toLowerCase();
  const out = (reply: string, extra: Partial<AgentResult> = {}): AgentResult => ({ reply, handoff: false, links: [], engine: "rule-based", ...extra });
  const products = await activeProducts(tenant.id);
  const menu = products.slice(0, 8).map((p) => `• ${p.name}`).join("\n");
  const cartCount = async () => (await ctx.cart.get()).length;

  if (/\b(human|agent|person|manager|staff|call me)\b/.test(t) || /(مدير|موظف)/.test(text)) return out("Sure — I'm passing you to a team member. They'll reply here shortly.", { handoff: true });

  // cart commands
  if (/\b(clear|empty)\b.*\b(cart|basket)\b|\b(cart|basket)\b.*\b(clear|empty)\b/.test(t)) { await clearCart(ctx.cart); return out("Done — your cart is empty. What would you like to print?"); }
  const rm = t.match(/\bremove\b\D{0,12}(\d+)/);
  if (rm) { const r = await removeFromCart(tenant, ctx.cart, { index: Number(rm[1]) }); return r.ok ? out(`Removed.\n${r.summary}`, { offerButtons: r.item_count > 0 }) : out(r.error); }
  if (/\b(checkout|check out|confirm|that'?s all|thats all|done|pay now|place (the )?order)\b/.test(t) && !/\d/.test(t)) {
    const c = await checkoutMessage(tenant, ctx.cart);
    return c.ok ? out(c.message, { links: c.links }) : out("Your cart is empty — tell me what you'd like to print, e.g. \"500 business cards\".");
  }
  if (/^\W*(my |show |view )?(cart|basket)\W*$/.test(t) || /\b(show|view|see|what'?s in)\b.*\b(cart|basket)\b/.test(t)) {
    const v = await viewCart(tenant, ctx.cart);
    return out(v.summary, { offerButtons: v.item_count > 0 });
  }

  // items: "add 100 flyers", "500 business cards and 100 flyers"
  const segs = splitItems(text);
  const found = segs.map((s) => ({ seg: s, qty: Number(s.match(/(\d+)/)?.[1]), product: matchProduct(products, s.toLowerCase()) })).filter((x) => x.product && Number.isInteger(x.qty) && x.qty > 0);
  const wantsAdd = /\badd\b/.test(t) || found.length > 1 || (found.length === 1 && (await cartCount()) > 0);
  if (found.length && wantsAdd) {
    const notes: string[] = [];
    for (const f of found) {
      const r = await addToCart(tenant, ctx.cart, { product_slug: f.product!.slug, quantity: f.qty, pages: f.product!.config.perPage ? 1 : undefined });
      if (!r.ok) {
        const presets = f.product!.config.quantityPresets;
        notes.push(`${r.error}${presets ? ` Available quantities for ${f.product!.name}: ${presets.join(", ")}.` : ""}`);
      }
    }
    const v = await viewCart(tenant, ctx.cart);
    return out([...(v.item_count ? [v.summary] : []), ...notes, v.item_count ? "Reply \"checkout\" when you're ready, or add more." : ""].filter(Boolean).join("\n"), { offerButtons: v.item_count > 0 });
  }
  if (found.length === 1) { // single quick quote with a link (does not touch the cart)
    const { product, qty } = found[0];
    const args = { product_slug: product!.slug, quantity: qty, pages: product!.config.perPage ? 1 : undefined };
    const q = await quotePrice(tenant, args);
    if (!q.ok) {
      const presets = product!.config.quantityPresets;
      return out(presets ? `${q.error}\nAvailable quantities for ${product!.name}: ${presets.join(", ")}.` : q.error);
    }
    const l = await sendCheckoutLink(tenant, args);
    const link = l.ok ? l.url : "";
    return out(`${q.quantity} × ${q.product}: AED ${q.total_aed.toFixed(2)} incl. ${q.vat_rate_percent}% VAT (delivery extra, default options). Choose options, upload your files and pay online here:\n${link}\nReply "add ${q.quantity} ${q.product}" to put it in your cart with other items.`, { links: link ? [link] : [] });
  }

  if (/\b(hours|open|location|address|where|deliver|delivery|pickup|pick up)\b/.test(t)) {
    return out(`${tenant.name}${tenant.address ? ` — ${tenant.address}` : ""}.\nWe offer pickup and scheduled delivery across the UAE. Payment is online only (no cash on delivery).`);
  }
  const hi = ctx.firstMessage || /\b(hi|hello|hey|salam|salaam)\b/.test(t) || /(مرحبا|السلام)/.test(text);
  return out(`${hi ? `Hello! Welcome to ${tenant.name}. ` : ""}What would you like to print? For example: "100 business cards" or "500 business cards and 100 flyers".\n${menu}`, { offerButtons: (await cartCount()) > 0 });
}
