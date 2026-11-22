import { test } from "node:test";
import assert from "node:assert/strict";
import { signBody, verifySignature } from "./signature";
import { parseWebhook } from "./parse";
import { computeLinePrice } from "@/lib/pricing";
import { DEFAULT_PRODUCTS } from "@/lib/catalog-defaults";
import { SERVICE_WINDOW_MS } from "./graph-window";

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
