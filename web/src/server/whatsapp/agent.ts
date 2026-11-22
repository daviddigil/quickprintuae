import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { Tenant } from "@/db/schema";
import { env } from "@/lib/env";
import { listProducts, quotePrice, sendCheckoutLink, shopInfo } from "./tools";
import { ruleBasedReply } from "./fallback";

export interface AgentResult { reply: string; handoff: boolean; links: string[] }
export interface HistoryMsg { role: "user" | "assistant"; content: string }

let client: Anthropic | null = null;
const anthropic = () => (client ??= new Anthropic({ apiKey: env.anthropicKey }));

const QuoteInput = z.object({
  product_slug: z.string().min(1).max(80), quantity: z.number().int().min(1).max(1_000_000),
  pages: z.number().int().min(1).max(10_000).optional(), selections: z.record(z.string(), z.string()).optional(),
});

const SYSTEM = (tenant: Tenant, greeting: string) => `You are the WhatsApp ordering assistant for "${tenant.name}", a print shop in the UAE. You chat with customers on WhatsApp.

Style: short, friendly WhatsApp messages (1–4 short lines, no markdown headings). Mirror the customer's language — reply in Arabic if they write Arabic, English otherwise. Currency is AED; prices exclude delivery and VAT is ${tenant.settings.vatRate ?? 5}%${tenant.settings.pricesIncludeVat ? " (already included in prices)" : " (added on top)"} — always say whether a quote includes VAT.${greeting ? `\nWhen greeting a new customer, use this opening if suitable: "${greeting}"` : ""}

Rules:
- Never state a price you did not get from quote_price. Never invent products, options, hours or fees; use list_products and shop_info.
- To help a customer order: find the product, ask only for what you need (quantity, key options like size/paper/colour), call quote_price, then call send_checkout_link and share the URL. Files are uploaded and payment is made ONLY on that link.
- Payment is online only. Cash on delivery is NOT available — say so politely if asked.
- Never ask for or accept card numbers, passwords, Emirates ID or passport scans in chat; point them to the secure link.
- If the customer is upset, wants a custom job you can't quote, asks for a refund or a person, call handoff_to_human.
- Politely decline unrelated requests and steer back to printing.`;

const TOOLS: Anthropic.Beta.Messages.BetaTool[] = [
  { name: "list_products", description: "List the shop's active products with option keys/values, quantity presets and starting prices.", input_schema: { type: "object", properties: {} } },
  { name: "quote_price", description: "Exact price for a product configuration, computed by the shop's pricing engine. Omitted options use defaults.", input_schema: { type: "object", properties: { product_slug: { type: "string" }, quantity: { type: "integer" }, pages: { type: "integer", description: "Pages per copy, for per-page products like document printing" }, selections: { type: "object", additionalProperties: { type: "string" }, description: "option key -> choice value from list_products" } }, required: ["product_slug", "quantity"] } },
  { name: "send_checkout_link", description: "Get the storefront link prefilled with this configuration. Customer uploads files, chooses pickup/delivery and pays there. Share the URL in your reply.", input_schema: { type: "object", properties: { product_slug: { type: "string" }, quantity: { type: "integer" }, pages: { type: "integer" }, selections: { type: "object", additionalProperties: { type: "string" } } }, required: ["product_slug", "quantity"] } },
  { name: "shop_info", description: "Shop address, pickup locations, delivery zones/fees, hours and payment policy.", input_schema: { type: "object", properties: {} } },
  { name: "handoff_to_human", description: "Pause the AI and notify the shop team to take over this chat.", input_schema: { type: "object", properties: { reason: { type: "string" } }, required: ["reason"] } },
];

export async function runAgent(tenant: Tenant, history: HistoryMsg[], opts: { greeting?: string; firstMessage?: boolean } = {}): Promise<AgentResult> {
  const lastUser = [...history].reverse().find((m) => m.role === "user")?.content ?? "";
  if (!env.anthropicKey) return ruleBasedReply(tenant, lastUser, !!opts.firstMessage);

  const links: string[] = [];
  let handoff = false;
  const messages: Anthropic.Beta.Messages.BetaMessageParam[] = history.map((m) => ({ role: m.role, content: m.content }));
  try {
    for (let turn = 0; turn < 6; turn++) {
      const res = await anthropic().beta.messages.create({
        model: "claude-opus-5-5", max_tokens: 2000, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
        system: SYSTEM(tenant, opts.greeting ?? ""), tools: TOOLS, output_config: { effort: "low" }, messages,
      });
      if (res.stop_reason === "refusal") return { reply: "Sorry, I can't help with that here. A team member will follow up if needed.", handoff: false, links };
      if (res.stop_reason !== "tool_use") {
        const text = res.content.filter((b): b is Anthropic.Beta.Messages.BetaTextBlock => b.type === "text").map((b) => b.text).join("\n").trim();
        if (text) return { reply: text, handoff, links };
        return ruleBasedReply(tenant, lastUser, !!opts.firstMessage);
      }
      messages.push({ role: "assistant", content: res.content });
      const results: Anthropic.Beta.Messages.BetaToolResultBlockParam[] = [];
      for (const b of res.content) {
        if (b.type !== "tool_use") continue;
        let out: unknown;
        try {
          if (b.name === "list_products") out = await listProducts(tenant);
          else if (b.name === "shop_info") out = await shopInfo(tenant);
          else if (b.name === "quote_price") { const a = QuoteInput.safeParse(b.input); out = a.success ? await quotePrice(tenant, a.data) : { ok: false, error: "Invalid arguments" }; }
          else if (b.name === "send_checkout_link") {
            const a = QuoteInput.safeParse(b.input);
            out = a.success ? await sendCheckoutLink(tenant, a.data) : { ok: false, error: "Invalid arguments" };
            if (a.success && (out as { ok: boolean }).ok) links.push((out as { url: string }).url);
          } else if (b.name === "handoff_to_human") { handoff = true; out = { ok: true }; }
          else out = { ok: false, error: "Unknown tool" };
        } catch (e) { out = { ok: false, error: (e as Error).message }; }
        results.push({ type: "tool_result", tool_use_id: b.id, content: JSON.stringify(out) });
      }
      messages.push({ role: "user", content: results });
    }
    return { reply: "Let me get a team member to help you with this.", handoff: true, links };
  } catch (e) {
    console.error("whatsapp agent failed", e);
    return ruleBasedReply(tenant, lastUser, !!opts.firstMessage);
  }
}
