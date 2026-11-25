// Mock of the Meta Graph API + helpers to send SIGNED WhatsApp webhooks to the app.
// Run standalone:  node e2e/mock-meta.mjs   (port 4999)   — or import { buildWebhook, postWebhook } from this file.
// Control:  GET /__log   POST /__reset   POST /__fail {count}  (make the next N message sends fail with HTTP 500)
import http from "http";
import { createHmac } from "crypto";
import { pathToFileURL } from "url";

export const MOCK_META_PORT = Number(process.env.MOCK_META_PORT ?? 4999);
const APP_ID = process.env.MOCK_META_APP_ID ?? "1234567890";
const APP_SECRET = process.env.MOCK_META_APP_SECRET ?? "testappsecret123";
const log = [];       // every Graph call
let failNext = 0;
let counter = 0;

const json = (res, status, body) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
const gerr = (res, status, message, code = 190) => json(res, status, { error: { message, type: "OAuthException", code } });
const validToken = (auth) => /^Bearer (mock-token|EAAMOCK)/.test(auth ?? "");

export function startMockMeta(port = MOCK_META_PORT) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);
    let raw = ""; for await (const c of req) raw += c;
    const auth = req.headers.authorization ?? "";
    const parts = url.pathname.split("/").filter(Boolean); // [version, ...]
    if (url.pathname === "/__log") return json(res, 200, log);
    if (url.pathname === "/__reset") { log.length = 0; failNext = 0; return json(res, 200, { ok: true }); }
    if (url.pathname === "/__fail") { failNext = Number(JSON.parse(raw || "{}").count ?? 1); return json(res, 200, { failNext }); }
    let body; try { body = raw ? JSON.parse(raw) : undefined; } catch { body = undefined; }
    const entry = { method: req.method, path: url.pathname, query: Object.fromEntries(url.searchParams), auth, body, at: Date.now() };
    log.push(entry);

    const [, a, b] = parts; // /v21.0/<a>/<b>
    // code -> token
    if (a === "oauth" && b === "access_token") {
      const q = entry.query;
      if (q.client_id !== APP_ID || q.client_secret !== APP_SECRET) return gerr(res, 400, "Error validating client secret.", 1);
      if (!String(q.code ?? "").startsWith("mock-code")) return gerr(res, 400, "Invalid verification code format.", 100);
      return json(res, 200, { access_token: `mock-token-for-${q.code}`, token_type: "bearer" });
    }
    // POST /<waba>/subscribed_apps
    if (b === "subscribed_apps" && req.method === "POST") {
      if (!validToken(auth)) return gerr(res, 400, "Invalid OAuth access token.");
      return json(res, 200, { success: true });
    }
    // POST /<phone>/messages
    if (b === "messages" && req.method === "POST") {
      if (!validToken(auth)) return gerr(res, 400, "Invalid OAuth access token.");
      if (body?.status === "read") return json(res, 200, { success: true });
      if (failNext > 0) { failNext--; return gerr(res, 500, "Mock transient failure", 2); }
      return json(res, 200, { messaging_product: "whatsapp", contacts: [{ wa_id: body?.to }], messages: [{ id: `wamid.MOCKOUT${++counter}` }] });
    }
    // GET /<phone>?fields=...
    if (a && !b && req.method === "GET") {
      if (!validToken(auth)) return gerr(res, 400, "Invalid OAuth access token.");
      if (!/^\d+$/.test(a) || a === "000") return gerr(res, 404, "Unsupported get request. Object does not exist.", 100);
      return json(res, 200, { id: a, display_phone_number: "+971 50 111 2222", verified_name: "Mock Print Shop" });
    }
    return gerr(res, 404, `Mock Graph: no route ${req.method} ${url.pathname}`, 100);
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}

/* ---------- signed webhook helpers (what Meta would send to the app) ---------- */
export const sign = (raw, secret) => "sha256=" + createHmac("sha256", secret).update(raw).digest("hex");
const ts = () => String(Math.floor(Date.now() / 1000));
const wrap = (field, value) => ({ object: "whatsapp_business_account", entry: [{ id: "700000000000", changes: [{ field, value }] }] });

export const buildWebhook = {
  text: ({ phoneId, from, name = "Test Customer", wamid, text }) => wrap("messages", { messaging_product: "whatsapp", metadata: { display_phone_number: "971501112222", phone_number_id: phoneId }, contacts: [{ wa_id: from, profile: { name } }], messages: [{ id: wamid, from, timestamp: ts(), type: "text", text: { body: text } }] }),
  button: ({ phoneId, from, name = "Test Customer", wamid, buttonId, title }) => wrap("messages", { messaging_product: "whatsapp", metadata: { phone_number_id: phoneId }, contacts: [{ wa_id: from, profile: { name } }], messages: [{ id: wamid, from, timestamp: ts(), type: "interactive", interactive: { type: "button_reply", button_reply: { id: buttonId, title } } }] }),
  echo: ({ phoneId, to, wamid, text }) => wrap("smb_message_echoes", { messaging_product: "whatsapp", metadata: { phone_number_id: phoneId }, message_echoes: [{ id: wamid, to, from: "971501112222", timestamp: ts(), type: "text", text: { body: text } }] }),
  status: ({ phoneId, wamid, status }) => wrap("messages", { messaging_product: "whatsapp", metadata: { phone_number_id: phoneId }, statuses: [{ id: wamid, status, timestamp: ts() }] }),
};

/** POST a webhook payload. By default signs with the platform app secret; pass {secret} or {signature} to override. */
export async function postWebhook(base, payload, { secret = APP_SECRET, signature, raw } = {}) {
  const body = raw ?? JSON.stringify(payload);
  const headers = { "content-type": "application/json" };
  const sig = signature === undefined ? sign(body, secret) : signature;
  if (sig !== null) headers["x-hub-signature-256"] = sig;
  const res = await fetch(`${base}/api/webhooks/whatsapp`, { method: "POST", headers, body });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  startMockMeta().then(() => console.log(`mock Meta Graph listening on :${MOCK_META_PORT}`));
}
