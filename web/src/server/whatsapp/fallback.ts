import "server-only";
import type { Tenant } from "@/db/schema";
import { activeProducts, matchProduct, quotePrice, sendCheckoutLink } from "./tools";
import type { AgentResult } from "./agent";

/** Deterministic replies used when ANTHROPIC_API_KEY is unset (or the model is unavailable). */
export async function ruleBasedReply(tenant: Tenant, text: string, firstMessage: boolean): Promise<AgentResult> {
  const t = text.toLowerCase();
  const products = await activeProducts(tenant.id);
  const menu = products.slice(0, 8).map((p) => `• ${p.name}`).join("\n");

  if (/\b(human|agent|person|manager|staff|call me)\b/.test(t) || /(مدير|موظف)/.test(text)) {
    return { reply: "Sure — I'm passing you to a team member. They'll reply here shortly.", handoff: true, links: [] };
  }
  const qty = Number(t.match(/(\d[\d,]*)/)?.[1]?.replace(/,/g, ""));
  const product = matchProduct(products, t);
  if (product && Number.isInteger(qty) && qty > 0) {
    const pages = product.config.perPage ? 1 : undefined;
    const args = { product_slug: product.slug, quantity: qty, pages };
    const q = await quotePrice(tenant, args);
    if (!q.ok) {
      const presets = product.config.quantityPresets;
      return { reply: presets ? `${q.error}\nAvailable quantities for ${product.name}: ${presets.join(", ")}.` : q.error, handoff: false, links: [] };
    }
    const l = await sendCheckoutLink(tenant, args);
    const link = l.ok ? l.url : "";
    return {
      reply: `${q.quantity} × ${q.product}: AED ${q.total_aed.toFixed(2)} incl. ${q.vat_rate_percent}% VAT (delivery extra, default options). Choose options, upload your files and pay online here:\n${link}`,
      handoff: false, links: link ? [link] : [],
    };
  }
  if (/\b(hours|open|location|address|where|deliver|delivery|pickup|pick up)\b/.test(t)) {
    return { reply: `${tenant.name}${tenant.address ? ` — ${tenant.address}` : ""}.\nWe offer pickup and scheduled delivery across the UAE. Payment is online only (no cash on delivery).`, handoff: false, links: [] };
  }
  const hi = firstMessage || /\b(hi|hello|hey|salam|salaam)\b/.test(t) || /(مرحبا|السلام)/.test(text);
  return {
    reply: `${hi ? `Hello! Welcome to ${tenant.name}. ` : ""}What would you like to print? For example: "100 business cards" or "500 flyers".\n${menu}`,
    handoff: false, links: [],
  };
}
