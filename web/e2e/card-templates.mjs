// Business-card template gallery end to end: Templates is the first tab, thumbnails show the customer's own details, a click loads the
// template into the editor (editable text / logo / QR layers), add to cart + fake-payment checkout, the admin order shows the card proof,
// the AI allowance is untouched, no horizontal overflow at 390 px, axe finds no serious problems, and AI-off shops only see Templates.
//   PAYMENTS_FAKE=1 npm start   then   BASE=http://localhost:3271 [SHOTS=/some/dir] node e2e/card-templates.mjs
// The signup limit is 5/hour per IP: the helper presents a random address, restart the server to reset if you hit it.
import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "fs";
import { createRequire } from "module";
import { signupApi, sqlClient, verifyShop } from "./helpers.mjs";

const BASE = (process.env.BASE ?? "http://localhost:3271").replace(/\/$/, "");
const SHOTS = process.env.SHOTS ?? "/tmp/card-shots";
mkdirSync(SHOTS, { recursive: true });
const stamp = Date.now().toString(36);
const slug = `cards${stamp}`;
const email = `owner-${stamp}@cards.test`;
const pass = "cards-pass-123";
const step = (s) => console.log("✔", s);
const expect = (c, m) => { if (!c) throw new Error("ASSERT: " + m); };
const PNG = { name: "logo.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64") };
const axeSrc = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || "/opt/pw-browsers/chromium" });
const errors = [];
const overflow = async (page, label) => {
  const o = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(o <= 1, `horizontal overflow ${o}px on ${label} at ${page.viewportSize().width}px`);
};
const quotaOf = async (ctx) => (await (await ctx.request.get(`${BASE}/api/v1/ai/business-card?store=${slug}`)).json()).quota;
async function axe(page, label, include) {
  await page.evaluate(axeSrc);
  const r = await page.evaluate(([sel]) => axe.run(sel ? document.querySelector(sel) : document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } }), [include]);
  const bad = r.violations.filter((v) => ["serious", "critical"].includes(v.impact));
  expect(!bad.length, `axe ${label}: ` + bad.map((v) => `${v.id} (${v.nodes.length}) ${v.nodes.slice(0, 3).map((n) => n.html.slice(0, 160) + " " + (n.any[0]?.message ?? "")).join(" ## ")}`).join(" | "));
  const rest = r.violations.filter((v) => !["serious", "critical"].includes(v.impact)).map((v) => v.id);
  step(`axe ${label}: no serious or critical violations${rest.length ? ` (minor: ${rest.join(", ")})` : ""}`);
}

try {
  const su = await signupApi(BASE, { slug, shopName: `Cards ${stamp}`, ownerName: "Cards Owner", email, password: pass });
  expect(su.ok, "signup failed: " + JSON.stringify(su.body ?? su.status));
  const sql = sqlClient(); await verifyShop(sql, slug);
  step(`shop ${slug} created`);

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`desktop: ${e.message}`));
  const q0 = await quotaOf(ctx);
  await page.goto(`${BASE}/s/${slug}/p/business-cards`, { waitUntil: "networkidle" });
  expect((await page.getByText("Pick a ready-made template or create with AI").count()) === 1, "storefront copy near the designer");

  // ---------- Templates is the first tab, AI second ----------
  await page.getByTestId("template-gallery").waitFor();
  const lazy = await page.locator('[data-testid="template-tile"] svg[viewBox]').count();
  expect(lazy > 0 && lazy < 20, `thumbnails are rendered lazily: ${lazy} SVGs on first paint`);
  await page.getByRole("radio", { name: /Double-sided/ }).check({ force: true });
  const tabs = page.locator('[role="tablist"][aria-label="Card design"] [role="tab"]');
  const names = (await tabs.allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim());
  expect(/^Templates$/.test(names[0]) && /AI design/.test(names[1]) && /Edit/.test(names[2]), "tab order: " + names);
  expect(await tabs.first().getAttribute("aria-selected") === "true", "Templates tab is selected first");
  await page.getByTestId("template-gallery").waitFor();
  expect(/\d+ left/.test(names[1]) && q0.remaining === q0.limit, "AI tab shows the remaining count: " + names[1]);
  step(`Templates is the first tab, "${names[1]}" second`);
  const total = await page.getByTestId("template-tile").count();
  expect(total >= 36, "36+ template tiles, got " + total);
  expect(await page.getByTestId("template-blank").isVisible(), "start blank tile");
  const cta = page.getByTestId("ai-cta");
  expect(/Want something unique\? Create with AI/.test(await cta.innerText()) && /left this month/.test(await cta.innerText()), "AI call to action: " + (await cta.innerText()));
  step(`${total} templates, a Start blank tile and the "Create with AI" card`);

  // ---------- typing updates the thumbnails (before: sample text) ----------
  const tileText = async () => (await page.locator('[data-testid="template-tile"] svg text').evaluateAll((els) => els.map((e) => e.textContent))).join(" ");
  await page.locator('[data-template="minimal-slate"] svg').first().waitFor();
  expect(/Your Name/.test(await tileText()), "sample text before typing");
  await page.locator("#tg-name").fill("Layla Hassan");
  await page.getByLabel("Job title").first().fill("Dentist");
  await page.getByLabel("Company").first().fill("Smile Clinic");
  await page.getByLabel("Phone").first().fill("+971 55 000 1111");
  await page.getByLabel("Website (adds a QR code)").first().fill("smile.ae");
  await page.waitForFunction(() => { const t = [...document.querySelectorAll('[data-testid="template-tile"] svg text')].map((x) => x.textContent).join(" "); return /Layla/.test(t) && /Smile/.test(t) && !/Your Name/.test(t); }, null, { timeout: 15000 });
  const after = await tileText();
  expect(/Layla/.test(after) && /Smile/.test(after) && !/Your Name/.test(after), "thumbnails show the typed details");
  expect(await page.locator('[data-testid="template-tile"] svg path').count() > 3, "QR codes from the website show on the backs");
  step("typing a name updates every thumbnail live");

  // ---------- filters ----------
  await page.getByRole("button", { name: "Dark", exact: true }).click();
  const darkN = await page.getByTestId("template-tile").count();
  expect(darkN >= 3 && darkN < total, "category filter: " + darkN);
  await page.getByRole("button", { name: "Industry", exact: true }).click();
  await page.getByRole("button", { name: "Law & finance", exact: true }).click();
  expect(await page.getByTestId("template-tile").count() >= 2, "industry filter");
  await page.getByRole("button", { name: "All", exact: true }).click();
  await page.getByPlaceholder(/Search templates/).fill("gold");
  const goldN = await page.getByTestId("template-tile").count();
  expect(goldN >= 3 && goldN < total, "search: " + goldN);
  await page.getByPlaceholder(/Search templates/).fill("");
  step("category chips, industry chips and search filter the grid");

  // ---------- back side: flip button (touch) and hover ----------
  const tile = page.locator('[data-template="navy-gold"]');
  await tile.scrollIntoViewIfNeeded();
  const flip = tile.getByTestId("template-flip");
  expect(await flip.getAttribute("aria-pressed") === "false", "flip starts on the front");
  await flip.click();
  expect(await flip.getAttribute("aria-pressed") === "true" && /back/.test(await tile.innerText()), "flip shows the back");
  await flip.click();
  step("flip button shows the back of a template");

  // ---------- gallery screenshots + axe (desktop) ----------
  await page.locator("#tg-name").scrollIntoViewIfNeeded();
  await page.getByTestId("template-gallery").scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${SHOTS}/gallery-1280.png`, fullPage: false });
  await axe(page, "gallery (desktop)", '[data-testid="template-gallery"]');

  // ---------- logo + pick a template ----------
  await page.getByTestId("card-logo-input").setInputFiles(PNG);
  await page.waitForFunction(() => document.querySelector('[data-testid="template-tile"] svg image'), null, { timeout: 10000 });
  await page.locator('[data-template="minimal-slate"]').scrollIntoViewIfNeeded();
  await page.getByRole("button", { name: /Use the Clean Slate template/ }).click();
  await page.getByTestId("card-tab-edit").waitFor();
  expect(await page.getByTestId("card-tab-edit").getAttribute("aria-selected") === "true", "editor opens after the click");
  const layers = page.locator("ul.max-h-40");
  const layerText = await layers.innerText();
  expect(/Layla Hassan/.test(layerText), "editable text layer: " + layerText);
  expect(/Logo/.test(await page.locator("ul.max-h-40").innerText()) || (await page.locator("ul.max-h-40 li").count()) > 0, "layers listed");
  await page.getByTestId("card-tab-edit").focus();
  await page.getByRole("button", { name: "back", exact: true }).click();
  const backLayers = await layers.innerText();
  expect(/QR code/.test(backLayers) && /Logo/.test(backLayers), "back has the QR code and the logo layer: " + backLayers);
  await page.getByRole("button", { name: "front", exact: true }).click();
  await page.locator("ul.max-h-40 button", { hasText: "Layla Hassan" }).click();
  await page.locator("textarea").first().fill("Dr Layla Hassan");
  expect(/Dr Layla Hassan/.test(await layers.innerText()), "text is editable");
  step("clicking a template opens the editor with editable text, logo and QR layers");
  expect((await page.getByTestId("sample-note").count()) === 0, "no sample-text note when the customer filled in details");

  // ---------- AI allowance untouched ----------
  const q1 = await quotaOf(ctx);
  expect(q1.used === q0.used && q1.remaining === q0.remaining, `AI quota unchanged: ${JSON.stringify(q0)} -> ${JSON.stringify(q1)}`);
  step(`AI allowance unchanged after using templates (${q1.remaining} of ${q1.limit} left)`);

  // ---------- add to cart, checkout, admin proof ----------
  await page.getByTestId("add-to-cart").click();
  await page.waitForURL(/\/cart/, { timeout: 20000 });
  await page.goto(`${BASE}/s/${slug}/checkout`);
  await page.fill('input[name="name"]', "Layla Hassan");
  await page.fill('input[name="email"]', "layla@example.com");
  await page.fill('input[name="phone"]', "+971501234567");
  await page.getByTestId("mode-pickup").click();
  const slots = page.locator('[data-testid="slots"] button');
  await slots.first().waitFor();
  await slots.nth((await slots.count()) - 1).click();
  await page.getByTestId("place-order").click();
  await page.waitForURL(/\/orders\//, { timeout: 30000 });
  await page.reload({ waitUntil: "networkidle" });
  const orderNo = (await page.locator("body").innerText()).match(/[A-Z]{2,4}-\d{4,}/)?.[0];
  expect(orderNo, "order number");
  step(`order ${orderNo} placed with the template design and paid with fake payment`);

  const admin = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  admin.on("pageerror", (e) => errors.push(`admin: ${e.message}`));
  await admin.goto(`${BASE}/login`);
  await admin.fill('input[name="email"]', email); await admin.fill('input[name="password"]', pass);
  await admin.getByRole("button", { name: "Sign in" }).click();
  await admin.waitForURL(/\/admin/);
  await admin.goto(`${BASE}/admin/orders?q=${orderNo}`);
  await admin.getByText(orderNo).first().click();
  await admin.waitForURL(/\/admin\/orders\/[0-9a-f-]+/);
  await admin.locator('[data-side="front"] svg').first().waitFor({ timeout: 15000 });
  expect(/Dr Layla Hassan/.test(await admin.locator('[data-side="front"] svg').first().innerHTML()), "admin proof shows the edited name");
  expect(await admin.locator('[data-side="back"] svg').count() > 0, "admin proof shows the back too");
  await admin.screenshot({ path: `${SHOTS}/admin-order.png`, fullPage: true });
  step("admin order shows the card design proof (front and back)");

  // ---------- six representative templates, large (front and back) in the editor ----------
  const reps = ["minimal-slate", "marble-orange", "navy-gold", "neon-lime", "block-magenta", "vintage-badge", "luxe-gold", "split-red"];
  await page.goto(`${BASE}/s/${slug}/p/business-cards`, { waitUntil: "networkidle" });
  await page.getByRole("radio", { name: /Double-sided/ }).check({ force: true });
  await page.locator("#tg-name").fill("Layla Hassan");
  await page.getByLabel("Job title").first().fill("Dentist");
  await page.getByLabel("Company").first().fill("Smile Clinic");
  await page.getByLabel("Phone").first().fill("+971 55 000 1111");
  await page.getByLabel("Email").first().fill("layla@smile.ae");
  await page.getByLabel("Website (adds a QR code)").first().fill("smile.ae");
  await page.getByLabel("Address (optional)").first().fill("Business Bay, Dubai");
  for (const id of reps) {
    await page.getByTestId("card-tab-templates").click();
    await page.locator(`[data-template="${id}"] button`).first().scrollIntoViewIfNeeded();
    await page.locator(`[data-template="${id}"] button`).first().click();
    await page.getByTestId("card-tab-edit").waitFor();
    const canvas = page.locator("svg.touch-none");
    await page.waitForTimeout(250);
    await canvas.screenshot({ path: `${SHOTS}/large-${id}-front.png` });
    await page.getByRole("button", { name: "back", exact: true }).click();
    await page.waitForTimeout(150);
    await canvas.screenshot({ path: `${SHOTS}/large-${id}-back.png` });
    await page.getByRole("button", { name: "front", exact: true }).click();
  }
  step(`screenshots of ${reps.length} templates (front and back) saved to ${SHOTS}`);

  // ---------- AI tab still works as the second tab and shares the details ----------
  await page.getByTestId("card-tab-ai").click();
  expect(await page.getByTestId("card-name").first().inputValue() === "Layla Hassan", "details are shared with the AI panel (nothing typed twice)");
  await page.getByTestId("card-tab-templates").click();
  expect(await page.locator("#tg-name").inputValue() === "Layla Hassan", "details are shared back with the gallery");
  step("details are shared between the Templates and AI tabs");

  // ---------- mobile 390 ----------
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const m = await mctx.newPage();
  m.on("pageerror", (e) => errors.push(`mobile: ${e.message}`));
  await m.goto(`${BASE}/s/${slug}/p/business-cards`, { waitUntil: "networkidle" });
  await m.getByTestId("template-gallery").waitFor();
  await m.getByRole("radio", { name: /Double-sided/ }).check({ force: true });
  await m.locator("#tg-name").fill("Layla Hassan");
  await m.waitForTimeout(600);
  await overflow(m, "business card page (templates)");
  await m.getByTestId("template-grid").scrollIntoViewIfNeeded();
  await m.screenshot({ path: `${SHOTS}/gallery-390.png`, fullPage: false });
  await m.getByRole("button", { name: "Industry", exact: true }).click();
  await overflow(m, "business card page (industry chips)");
  await m.getByRole("button", { name: "All", exact: true }).click();
  const small = await m.locator('[data-testid="template-tile"] button').evaluateAll((els) => els.filter((e) => { const r = e.getBoundingClientRect(); return r.height < 44; }).length);
  expect(small === 0, "tiles are at least 44 px tall");
  const flipSizes = await m.getByTestId("template-flip").evaluateAll((els) => els.map((e) => Math.min(e.getBoundingClientRect().width, e.getBoundingClientRect().height)));
  expect(flipSizes.length > 0 && flipSizes.every((s) => s >= 44), "flip buttons are 44 px targets");
  await axe(m, "gallery (390 px)", '[data-testid="template-gallery"]');
  await m.getByTestId("template-flip").first().tap();
  await m.getByTestId("card-tab-templates").click();
  // pick on mobile and check the editor does not overflow
  await m.locator('[data-template="minimal-slate"] button').first().tap();
  await m.getByTestId("card-tab-edit").waitFor();
  await overflow(m, "editor");
  step("390 px: no horizontal overflow, 44 px targets, axe clean");

  // ---------- picking before typing anything: the editor warns that the text and QR link are samples ----------
  const e = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await e.goto(`${BASE}/s/${slug}/p/business-cards`, { waitUntil: "networkidle" });
  await e.locator('[data-template="minimal-slate"] button').first().click();
  await e.getByTestId("sample-note").waitFor();
  expect(/sample/.test(await e.getByTestId("sample-note").innerText()), "sample note");
  await e.getByRole("button", { name: "Got it" }).click();
  expect(await e.getByTestId("sample-note").count() === 0, "sample note can be dismissed");
  step("a template picked before typing any details shows a sample-text warning in the editor");

  // ---------- AI disabled for the shop: only Templates (and Edit) ----------
  await sql`update tenants set settings = jsonb_set(coalesce(settings, '{}'::jsonb), '{aiDesignerEnabled}', 'false') where slug = ${slug}`;
  await page.goto(`${BASE}/s/${slug}/p/business-cards`, { waitUntil: "networkidle" });
  const t2 = (await page.locator('[role="tablist"][aria-label="Card design"] [role="tab"]').allInnerTexts()).map((x) => x.trim());
  expect(t2.length === 2 && t2[0] === "Templates" && t2[1] === "Edit", "AI off: " + t2);
  expect(await page.getByTestId("ai-cta").count() === 0, "no AI call to action when AI is off");
  expect(/Pick a ready-made template/.test(await page.locator("body").innerText()) && !/create with AI/i.test(await page.locator("main").innerText()), "copy without AI");
  step("AI off: only Templates and Edit are offered");

  // ---------- AI allowance used up: CTA disabled with the message ----------
  await sql`update tenants set settings = jsonb_set(coalesce(settings, '{}'::jsonb), '{aiDesignerEnabled}', 'true') where slug = ${slug}`;
  await sql.end();
  await ctx.route("**/api/v1/ai/business-card?**", (r) => r.fulfill({ json: { quota: { used: 3, limit: 3, remaining: 0, period: "x" } } }));
  await page.goto(`${BASE}/s/${slug}/p/business-cards`, { waitUntil: "networkidle" });
  await page.getByTestId("ai-cta").waitFor();
  await page.getByText("You have used all 3 AI designs this month").first().waitFor();
  expect(await page.getByTestId("ai-cta-btn").isDisabled(), "AI button disabled when the allowance is used up");
  step("allowance used up: the AI button is disabled with the message, templates stay free");

  expect(errors.length === 0, "page errors: " + errors.join(" | "));
  console.log("\nALL CARD-TEMPLATE CHECKS PASSED");
} finally { await browser.close(); }
