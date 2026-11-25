// Mock of the Anthropic Messages API so the REAL agent tool loop (src/server/whatsapp/agent.ts) runs end to end without network.
// Point the app at it: ANTHROPIC_BASE_URL=http://localhost:4998 ANTHROPIC_API_KEY=sk-ant-mock
// Scenarios are chosen by a keyword in the customer's message:
//   MOCK_CART    -> add_to_cart x2 (with options) -> send_checkout_links -> short text
//   MOCK_QUOTE   -> quote_price -> text quoting the tool's total
//   MOCK_INJECT  -> a "manipulated" model tries invalid add_to_cart args (must be rejected by the server) then apologises
//   MOCK_VIEW    -> view_cart -> text
//   MOCK_ERROR   -> HTTP 529 overloaded       MOCK_REFUSE -> stop_reason "refusal"
//   anything else -> plain text reply
// Control: GET /__log   POST /__reset
import http from "http";
import { pathToFileURL } from "url";

export const MOCK_ANTHROPIC_PORT = Number(process.env.MOCK_ANTHROPIC_PORT ?? 4998);
const log = [];
let n = 0;

const json = (res, status, body) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
const textOf = (content) => typeof content === "string" ? content : (content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
const msg = (content, stop_reason) => ({ id: `msg_mock_${++n}`, type: "message", role: "assistant", model: "claude-opus-5-5", content, stop_reason, stop_sequence: null, usage: { input_tokens: 100, output_tokens: 50 } });
const tool = (name, input) => ({ type: "tool_use", id: `toolu_mock_${++n}`, name, input });

export function startMockAnthropic(port = MOCK_ANTHROPIC_PORT) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);
    let raw = ""; for await (const c of req) raw += c;
    if (url.pathname === "/__log") return json(res, 200, log);
    if (url.pathname === "/__reset") { log.length = 0; return json(res, 200, { ok: true }); }
    if (!url.pathname.startsWith("/v1/messages") || req.method !== "POST") return json(res, 404, { type: "error", error: { type: "not_found_error", message: "mock: not found" } });
    const body = JSON.parse(raw || "{}");
    const messages = body.messages ?? [];
    const last = messages[messages.length - 1];
    const resultsMode = last?.role === "user" && Array.isArray(last.content) && last.content.some((b) => b.type === "tool_result");
    // the customer's message that started this tool loop = latest user turn that has plain text
    const customer = [...messages].reverse().find((m) => m.role === "user" && textOf(m.content).trim() && !(Array.isArray(m.content) && m.content.every((b) => b.type === "tool_result")));
    const text = textOf(customer?.content);
    const prevTools = resultsMode ? (messages[messages.length - 2]?.content ?? []).filter((b) => b.type === "tool_use").map((b) => b.name) : [];
    const results = resultsMode ? last.content.filter((b) => b.type === "tool_result").map((b) => { try { return JSON.parse(b.content); } catch { return b.content; } }) : [];
    log.push({ model: body.model, tools: (body.tools ?? []).map((t) => t.name), system: typeof body.system === "string" ? body.system : JSON.stringify(body.system), customer: text, resultsMode, prevTools, results, apiKey: req.headers["x-api-key"] ?? ((req.headers.authorization ?? "").replace(/^Bearer /, "") || undefined), headerNames: Object.keys(req.headers), messageCount: messages.length });

    if (text.includes("MOCK_ERROR")) return json(res, 529, { type: "error", error: { type: "overloaded_error", message: "Overloaded (mock)" } });
    if (text.includes("MOCK_REFUSE")) return json(res, 200, { ...msg([], "refusal"), stop_details: { type: "refusal", category: "general_harms", explanation: "mock" } });

    if (text.includes("MOCK_CART")) {
      if (!resultsMode) return json(res, 200, msg([
        tool("add_to_cart", { product_slug: "business-cards", quantity: 500, selections: { stock: "400softtouch" } }),
        tool("add_to_cart", { product_slug: "flyers", quantity: 100, selections: { size: "A4" } }),
      ], "tool_use"));
      if (prevTools.includes("add_to_cart")) return json(res, 200, msg([tool("send_checkout_links", {})], "tool_use"));
      return json(res, 200, msg([{ type: "text", text: "Here's your cart 👇" }], "end_turn"));
    }
    if (text.includes("MOCK_QUOTE")) {
      if (!resultsMode) return json(res, 200, msg([tool("quote_price", { product_slug: "business-cards", quantity: 500 })], "tool_use"));
      const total = results[0]?.total_aed;
      return json(res, 200, msg([{ type: "text", text: `500 business cards: AED ${Number(total).toFixed(2)} incl. VAT (delivery extra).` }], "end_turn"));
    }
    if (text.includes("MOCK_INJECT")) {
      if (!resultsMode) return json(res, 200, msg([
        tool("add_to_cart", { product_slug: "business-cards; DROP TABLE", quantity: -5 }),
        tool("add_to_cart", { product_slug: "business-cards", quantity: 500, selections: { stock: "free-gold", price: "0.01" } }),
        tool("quote_price", { product_slug: "nope", quantity: 1 }),
      ], "tool_use"));
      return json(res, 200, msg([{ type: "text", text: "Sorry, I couldn't add that — please tell me the product and quantity again." }], "end_turn"));
    }
    if (text.includes("MOCK_VIEW")) {
      if (!resultsMode) return json(res, 200, msg([tool("view_cart", {})], "tool_use"));
      return json(res, 200, msg([{ type: "text", text: `You have ${results[0]?.item_count ?? 0} item(s) in your cart.` }], "end_turn"));
    }
    return json(res, 200, msg([{ type: "text", text: `Hello from mock Claude! You said: ${text.slice(0, 60)}` }], "end_turn"));
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  startMockAnthropic().then(() => console.log(`mock Anthropic listening on :${MOCK_ANTHROPIC_PORT}`));
}
