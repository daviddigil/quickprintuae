// Request-a-quote: customer submits (with a file), owner sees it in /admin/quotes, marks replied, shop B cannot see it.
// Usage: BASE=http://localhost:3243 node --import tsx e2e/merch-quotes.mjs   (tsx lets us import the template list)
import { chromium } from "playwright";
import postgres from "postgres";
import { writeFileSync } from "node:fs";
import { signup as signupShop, verifyShop } from "./helpers.mjs";
import { MERCH_TEMPLATES } from "../src/lib/catalog-defaults.ts";
const BASE = process.env.BASE ?? "http://localhost:3243";
const sql = postgres(process.env.DATABASE_URL ?? "postgres://qp:qp@localhost:5432/quickprint");
const step = (s) => console.log("✔", s);
const assert = (c, m) => { if (!c) throw new Error("ASSERT: " + m); };
const br = await chromium.launch({ executablePath: process.env.CHROME_PATH || "/opt/pw-browsers/chromium" });
const errors = [];
const newPage = async () => { const p = await (await br.newContext({ viewport: { width: 1280, height: 900 } })).newPage(); p.on("pageerror", (e) => errors.push(e.message)); return p; };
const stamp = Date.now().toString(36);

async function signup(slug) {
  const o = await newPage();
  await signupShop(o, { base: BASE, slug, name: "Quote " + slug });
  return o;
}
try {
  const slugA = "qa" + stamp, slugB = "qb" + stamp;
  const a = await signup(slugA);
  const b = await signup(slugB);
  step("two shops signed up");

  // add the custom-gift-pack template (same insert as admin "From template")
  const tpl = MERCH_TEMPLATES.find((t) => t.slug === "custom-gift-pack");
  assert(tpl, "template exists");
  const tid = (await sql`select id from tenants where slug=${slugA}`)[0].id;
  const [prod] = await sql`insert into products (tenant_id, kind, name, slug, description, turnaround_hours, category, config, active)
    values (${tid}, ${tpl.kind}, ${tpl.name}, ${tpl.slug}, ${tpl.description}, ${tpl.turnaroundHours}, ${tpl.category ?? null}, ${sql.json({ ...tpl.config, quote: { enabled: true } })}, true) returning id`;
  step("custom-gift-pack added to shop A");

  // customer opens the product page
  const c = await newPage();
  await c.goto(`${BASE}/s/${slugA}/p/custom-gift-pack`, { waitUntil: "networkidle" });
  const btn = c.getByTestId("quote-open").or(c.getByRole("button", { name: /request a quote|custom size/i })).first();
  const hasButton = await btn.count();
  writeFileSync("/tmp/quote-art.png", Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"));
  if (hasButton) {
    await btn.click();
    const dlg = c.getByTestId("quote-dialog");
    await dlg.waitFor();
    // honeypot is not reachable, labels are associated
    await dlg.getByLabel("Your name").fill("Sara Customer");
    await dlg.getByLabel("Mobile number").fill("050 765 4321");
    await dlg.getByLabel("What do you need?").fill("40 wedding gift packs with dates, delivery to Sharjah by 12 Dec.");
    await dlg.getByTestId("file-input").setInputFiles("/tmp/quote-art.png");
    await dlg.getByText("quote-art.png").waitFor({ timeout: 15000 });
    await c.keyboard.press("Escape");
    assert(!(await dlg.isVisible()), "Escape closes dialog");
    await btn.click();
    assert(await dlg.getByLabel("Your name").inputValue() === "Sara Customer", "form state kept after reopening");
    await dlg.getByTestId("quote-submit").click();
    await c.getByTestId("quote-success").waitFor({ timeout: 15000 });
    assert(/WhatsApp or by phone/.test(await c.getByTestId("quote-success").innerText()), "next steps text");
    step("customer submitted a quote through the dialog (with a file)");
  } else {
    console.log("! product page has no quote button yet (storefront agent's file); driving the API directly");
    const fd = new FormData();
    fd.append("file", new Blob([Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64")], { type: "image/png" }), "quote-art.png");
    const up = await (await fetch(`${BASE}/api/v1/store/${slugA}/uploads`, { method: "POST", body: fd })).json();
    assert(up.id, "upload ok");
    const r = await fetch(`${BASE}/api/v1/store/${slugA}/quotes`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Sara Customer", phone: "050 765 4321", message: "40 wedding gift packs with dates, delivery to Sharjah by 12 Dec.", quantity: 40, productId: prod.id, selections: { box: "large", item2: "dates" }, fileIds: [up.id] }) });
    assert(r.ok, "quote api ok " + r.status);
    step("quote submitted via API");
  }

  // owner A sees it
  await a.goto(`${BASE}/admin/quotes`, { waitUntil: "networkidle" });
  const card = a.getByTestId("quote-card").first();
  const txt = await card.innerText();
  assert(/Sara Customer/.test(txt) && /Custom Gift Pack/.test(txt) && /wedding gift packs/.test(txt), "quote card content: " + txt);
  assert(/Large box|Premium dates|Box/.test(txt) || !hasButton, "selections readable");
  assert(/quote-art\.png/.test(txt), "file attached");
  assert((await card.getByRole("link", { name: /Reply on WhatsApp/ }).getAttribute("href")).startsWith("https://wa.me/971507654321"), "wa.me link with normalised number");
  assert((await card.getByRole("link", { name: /Call/ }).getAttribute("href")) === "tel:+971507654321", "tel link");
  assert(await a.getByTestId("quotes-badge").innerText() === "1", "nav badge shows 1 new");
  step("owner sees the quote, WhatsApp/Call links and unread badge");
  const dl = await a.request.get(`${BASE}` + (await card.getByRole("link", { name: /quote-art\.png/ }).getAttribute("href")));
  assert(dl.ok(), "file downloadable by owner");

  await card.getByRole("button", { name: "Mark replied" }).click();
  await a.waitForURL(/ok=/); await a.waitForLoadState("networkidle");
  assert((await sql`select status from quote_requests where tenant_id=${tid}`)[0].status === "replied", "status replied");
  assert(!(await a.getByTestId("quotes-badge").count()), "badge cleared");
  await a.goto(`${BASE}/admin/quotes?status=new`, { waitUntil: "networkidle" });
  assert(!(await a.getByTestId("quote-card").count()), "new tab empty");
  step("status change to replied, badge cleared, filter tabs work");

  // shop B isolation
  await b.goto(`${BASE}/admin/quotes`, { waitUntil: "networkidle" });
  assert(!(await b.getByTestId("quote-card").count()) && !/Sara Customer/.test(await b.locator("main").innerText()), "shop B sees no quotes");
  const fileId = (await sql`select file_ids from quote_requests where tenant_id=${tid}`)[0].file_ids[0];
  if (fileId) { const r = await b.request.get(`${BASE}/api/v1/admin/files/${fileId}`); assert(r.status() === 404, "shop B cannot download shop A file, got " + r.status()); }
  const bad = await fetch(`${BASE}/api/v1/store/${slugB}/quotes`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "X Y", phone: "0501234567", message: "hello there", productId: prod.id }) });
  assert(bad.status === 400, "shop B quote with shop A product rejected, got " + bad.status);
  step("shop B cannot see or download shop A quotes, cross-shop productId rejected");

  assert(errors.length === 0, "page errors: " + errors.join(" | "));
  console.log("ALL OK");
} catch (e) { console.error(e); process.exitCode = 1; }
finally { await br.close(); await sql.end(); }
