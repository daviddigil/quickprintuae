import { test } from "node:test";
import assert from "node:assert/strict";
import { signBody, verifySignature } from "./signature";
import { parseWebhook } from "./parse";
import { computeLinePrice } from "@/lib/pricing";
import { DEFAULT_PRODUCTS } from "@/lib/catalog-defaults";
import { SERVICE_WINDOW_MS } from "./graph-window";
import { AddToCartInput, RemoveInput, cartTotals, cfgLink, formatCartSummary, formatCheckoutMessage, sanitizeCustomerText, type WaCartItem } from "./cart-math";
import { splitItems } from "./fallback";

const SECRET = "test-app-secret";
const body = JSON.stringify({ hello: "world" });

test("signature: valid, wrong secret, tampered body, malformed header, missing secret", () => {
  const sig = signBody(body, SECRET);
  assert.equal(verifySignature(body, sig, SECRET), true);
  assert.equal(verifySignature(body, sig, "other"), false);
  assert.equal(verifySignature(body + " ", sig, SECRET), false);
  assert.equal(verifySignature(body, "sha256=zz", SECRET), false);
  assert.equal(verifySignature(body, "nope", SECRET), false);
  assert.equal(verifySignature(body, null, SECRET), false);
  assert.equal(verifySignature(body, sig, undefined), false);
});

const inbound = {
  object: "whatsapp_business_account",
  entry: [{ changes: [{ field: "messages", value: {
    metadata: { phone_number_id: "111" }, contacts: [{ wa_id: "971501234567", profile: { name: "Aisha" } }],
    messages: [{ id: "wamid.A", from: "971501234567", timestamp: "1700000000", type: "text", text: { body: "100 business cards" } },
      { id: "wamid.B", from: "971501234567", timestamp: "1700000001", type: "interactive", interactive: { button_reply: { id: "x", title: "Yes" } } }],
    statuses: [{ id: "wamid.OUT", status: "delivered", timestamp: "1700000002" }],
  } }] }],
};

test("parse: inbound text, interactive reply, status", () => {
  const ev = parseWebhook(inbound);
  assert.equal(ev.length, 3);
  assert.deepEqual(ev[0], { kind: "inbound", phoneNumberId: "111", from: "971501234567", name: "Aisha", wamid: "wamid.A", type: "text", text: "100 business cards", timestamp: 1700000000, raw: inbound.entry[0].changes[0].value.messages[0] });
  assert.equal(ev[1].kind === "inbound" && ev[1].text, "Yes");
  assert.equal(ev[1].kind === "inbound" && ev[1].buttonId, "x"); // interactive button reply id
  assert.equal("buttonId" in ev[0], false); // plain text has no buttonId key
  assert.equal(ev[2].kind === "status" && ev[2].status, "delivered");
});

test("parse: smb_message_echoes become echo events (owner replied from the app)", () => {
  const ev = parseWebhook({ object: "whatsapp_business_account", entry: [{ changes: [{ field: "smb_message_echoes", value: { metadata: { phone_number_id: "111" }, message_echoes: [{ id: "wamid.E", to: "971501234567", timestamp: "1700000100", type: "text", text: { body: "On it!" } }] } }] }] });
  assert.equal(ev.length, 1);
  assert.equal(ev[0].kind, "echo");
  assert.equal(ev[0].kind === "echo" && ev[0].to, "971501234567");
});

test("parse: ignores other objects and payloads without phone_number_id", () => {
  assert.deepEqual(parseWebhook({ object: "page", entry: [] }), []);
  assert.deepEqual(parseWebhook({ object: "whatsapp_business_account", entry: [{ changes: [{ field: "messages", value: {} }] }] }), []);
  assert.deepEqual(parseWebhook(null), []);
});

test("quote correctness: tool pricing == computeLinePrice (VAT added on top)", () => {
  const cards = DEFAULT_PRODUCTS.find((p) => p.kind === "business_card")!.config;
  const r = computeLinePrice(cards, { stock: "400softtouch" }, 500);
  assert.equal(r.lineTotal, 180); // 500 × 0.24 × 1.5 soft-touch
  assert.equal(Math.round(r.lineTotal * 1.05 * 100) / 100, 189);
});

test("24h service window constant", () => assert.equal(SERVICE_WINDOW_MS, 86_400_000));

/* ---------- chat cart (pure) ---------- */
const item = (slug: string, name: string, quantity: number, subtotalAed: number, selections: Record<string, string> = {}): WaCartItem =>
  ({ slug, name, quantity, pages: 1, selections, labels: { stock: "350 gsm matte" }, unitPriceAed: subtotalAed / quantity, subtotalAed });

test("cart totals: VAT added on top vs included", () => {
  const items = [item("business-cards", "Business Cards", 500, 120), item("flyers", "Flyers", 100, 60)];
  assert.deepEqual(cartTotals(items, 5, false), { subtotal: 180, vat: 9, total: 189 });
  assert.deepEqual(cartTotals(items, 5, true), { subtotal: 180, vat: 8.57, total: 180 });
  assert.deepEqual(cartTotals([], 5, false), { subtotal: 0, vat: 0, total: 0 });
});

test("cart totals match the pricing engine for real catalogue lines", () => {
  const cards = DEFAULT_PRODUCTS.find((p) => p.kind === "business_card")!.config;
  const flyers = DEFAULT_PRODUCTS.find((p) => p.kind === "flyer")!.config;
  const a = computeLinePrice(cards, {}, 500).lineTotal, b = computeLinePrice(flyers, {}, 100).lineTotal;
  const t = cartTotals([{ subtotalAed: a }, { subtotalAed: b }], 5, false);
  assert.equal(a, 120);
  assert.equal(t.total, Math.round((a + b) * 1.05 * 100) / 100);
});

test("checkout message: itemised, totals, one prefilled link per line, no COD", () => {
  const items = [item("business-cards", "Business Cards", 500, 120, { stock: "400softtouch" }), item("flyers", "Flyers", 100, 60)];
  const msg = formatCheckoutMessage({ shopName: "Demo Print Hub", items, vatRate: 5, pricesIncludeVat: false, appUrl: "http://x.test", tenantSlug: "demo" });
  assert.match(msg, /1\. 500 × Business Cards.*AED 120\.00/);
  assert.match(msg, /2\. 100 × Flyers.*AED 60\.00/);
  assert.match(msg, /Subtotal: AED 180\.00/); assert.match(msg, /VAT 5%: AED 9\.00/); assert.match(msg, /Total \(estimate\): AED 189\.00/);
  assert.match(msg, /Cash on delivery is not available/);
  const links = msg.match(/http:\/\/x\.test\/s\/demo\/p\/[a-z-]+\?cfg=[A-Za-z0-9_-]+/g)!;
  assert.equal(links.length, 2);
  const cfg = JSON.parse(Buffer.from(links[0].split("cfg=")[1], "base64url").toString());
  assert.deepEqual(cfg, { selections: { stock: "400softtouch" }, quantity: 500, pages: 1 });
  assert.equal(cfgLink("http://x.test", "demo", item("flyers", "Flyers", 100, 60)).includes("/p/flyers?cfg="), true);
  assert.match(formatCartSummary([], 5, false), /empty/);
});

test("add_to_cart arguments are validated strictly (model output is untrusted)", () => {
  assert.equal(AddToCartInput.safeParse({ product_slug: "business-cards", quantity: 500 }).success, true);
  for (const bad of [
    { product_slug: "Business Cards", quantity: 5 }, { product_slug: "a/b", quantity: 5 }, { product_slug: "flyers", quantity: 0 },
    { product_slug: "flyers", quantity: 1.5 }, { product_slug: "flyers", quantity: 5_000_000 }, { product_slug: "flyers", quantity: 5, selections: { a: 1 } },
    { product_slug: "flyers", quantity: 5, pages: -1 }, {}, null,
  ]) assert.equal(AddToCartInput.safeParse(bad).success, false, JSON.stringify(bad));
  assert.equal(RemoveInput.safeParse({ index: 0 }).success, false);
  assert.equal(RemoveInput.safeParse({ index: 2 }).success, true);
});

test("customer text is sanitised before reaching the model", () => {
  assert.equal(sanitizeCustomerText("hello\u200B\u202Eworld\u0000"), "helloworld");
  assert.equal(sanitizeCustomerText("x".repeat(5000)).length, 1500);
  assert.equal(sanitizeCustomerText("  500 business cards  "), "500 business cards");
});

test("multi-item phrases split correctly (keeps thousands separators)", () => {
  assert.deepEqual(splitItems("500 business cards and 100 flyers"), ["500 business cards", "100 flyers"]);
  assert.deepEqual(splitItems("1,000 flyers, 50 posters & 250 business cards"), ["1000 flyers", "50 posters", "250 business cards"]);
  assert.deepEqual(splitItems("add 100 flyers"), ["add 100 flyers"]);
});

/* ---------- feature flag + config (read at call time) ---------- */
import { aiMode, embeddedSignupReady, metaConfig, platformConfigured, whatsappEnabled } from "@/lib/whatsapp-flag";

test("WhatsApp is ON by default and can be switched off", () => {
  const keep = process.env.WHATSAPP_ENABLED;
  try {
    delete process.env.WHATSAPP_ENABLED; assert.equal(whatsappEnabled(), true);
    for (const v of ["0", "false", "off", "no", "FALSE"]) { process.env.WHATSAPP_ENABLED = v; assert.equal(whatsappEnabled(), false, v); }
    for (const v of ["1", "true", ""]) { process.env.WHATSAPP_ENABLED = v; assert.equal(whatsappEnabled(), true, v); }
  } finally { if (keep === undefined) delete process.env.WHATSAPP_ENABLED; else process.env.WHATSAPP_ENABLED = keep; }
});

test("platform config + Graph base are read at call time (mock servers) and AI mode follows the key", () => {
  const keep = { ...process.env };
  try {
    for (const k of ["META_APP_ID", "META_APP_SECRET", "META_VERIFY_TOKEN", "META_EMBEDDED_SIGNUP_CONFIG_ID", "META_GRAPH_BASE", "ANTHROPIC_API_KEY"]) delete process.env[k];
    assert.equal(platformConfigured(), false); assert.equal(embeddedSignupReady(), false);
    assert.equal(metaConfig().graphBase, "https://graph.facebook.com"); assert.equal(aiMode(), "rule-based");
    Object.assign(process.env, { META_APP_ID: "1", META_APP_SECRET: "s", META_VERIFY_TOKEN: "t", META_GRAPH_BASE: "http://localhost:4999/", ANTHROPIC_API_KEY: "k" });
    assert.equal(platformConfigured(), true); assert.equal(embeddedSignupReady(), false, "needs the signup config id too");
    process.env.META_EMBEDDED_SIGNUP_CONFIG_ID = "9"; assert.equal(embeddedSignupReady(), true);
    assert.equal(metaConfig().graphBase, "http://localhost:4999", "trailing slash trimmed"); assert.equal(aiMode(), "claude");
  } finally { for (const k of Object.keys(process.env)) if (!(k in keep)) delete process.env[k]; Object.assign(process.env, keep); }
});
