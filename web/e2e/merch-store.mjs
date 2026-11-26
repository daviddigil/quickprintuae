// Merchandise storefront end-to-end: categories, gallery, tier table, personalisation, artwork preview, cart, fake-payment checkout,
// admin order (personalisation, artwork, proof) and "no cost price in public output".
//   PAYMENTS_FAKE=1 npm start (port 3242)   then   BASE=http://localhost:3242 node e2e/merch-store.mjs
import { chromium } from "playwright";
import http from "http";
import { execFileSync } from "child_process";
import { signupApi, sqlClient, verifyShop } from "./helpers.mjs";

const BASE = (process.env.BASE ?? "http://localhost:3242").replace(/\/$/, "");
const IMG_PORT = 3299;
const stamp = Date.now().toString(36);
const slug = `merch${stamp}`;
const email = `owner-${stamp}@merch.test`;
const pass = "merch-pass-123";
const step = (s) => console.log("✔", s);
const fail = (m) => { throw new Error(m); };
const expect = (c, m) => { if (!c) fail(m); };

// ---- product photos served from a tiny server (CORS open so the admin proof can embed them) ----
const svg = (fill, label) => `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600"><rect width="800" height="600" fill="#eef2f7"/><rect x="220" y="170" width="360" height="280" rx="30" fill="${fill}" stroke="#334155" stroke-width="6"/><text x="400" y="540" font-size="28" text-anchor="middle" fill="#334155">${label}</text></svg>`;
const photos = { "/mug.svg": svg("#ffffff", "Mug front"), "/mug2.svg": svg("#f1f5f9", "Mug side"), "/tee.svg": svg("#e2e8f0", "T-shirt") };
const imgServer = http.createServer((req, res) => {
  const body = photos[req.url.split("?")[0]];
  if (!body) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": "image/svg+xml", "access-control-allow-origin": "*" }); res.end(body);
}).listen(IMG_PORT);

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const png = { name: "logo.png", mimeType: "image/png", buffer: PNG };

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const errors = [];
const overflow = async (page, label) => {
  const o = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(o <= 1, `horizontal overflow ${o}px on ${label} at ${page.viewportSize().width}px`);
};
try {
  // ---------- shop + templates ----------
  // two-step signup over the API: details, then the test card; live checkout needs a verified seller
  const su = await signupApi(BASE, { slug, shopName: `Merch ${stamp}`, ownerName: "Merch Owner", email, password: pass });
  expect(su.ok, "signup failed: " + JSON.stringify(su.body ?? su.status));
  const sql = sqlClient(); await verifyShop(sql, slug); await sql.end();
  execFileSync("npx", ["tsx", "e2e/merch-seed.ts", slug, `http://localhost:${IMG_PORT}`], { stdio: "inherit" });
  step(`shop ${slug} created with the printed-mug and t-shirt templates`);

  for (const width of [390, 1280]) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(`${width}: ${e.message}`));
    const mobile = width === 390;

    // ----- home: categories -----
    await page.goto(`${BASE}/s/${slug}`);
    const chips = page.getByTestId("category-chips");
    await chips.waitFor();
    const chipNames = await chips.locator("a").allInnerTexts();
    expect(["All", "Print", "Mugs", "Apparel"].every((n) => chipNames.map((x) => x.trim()).includes(n)), "category chips: " + chipNames);
    await overflow(page, "home");
    await chips.getByRole("link", { name: "Mugs", exact: true }).click();
    await page.waitForURL(/category=Mugs/);
    await page.getByRole("link", { name: /Printed Mug 11oz/ }).first().waitFor();
    expect(await page.locator("#products").getByRole("link", { name: /Document Printing/ }).count() === 0, "filter hides other categories");
    expect(await page.locator('a[href*="/p/printed-mug"] img').first().getAttribute("src"), "card shows a photo");
    expect(await page.getByText(/^from/).first().isVisible(), "from price");
    // works without JS: the chip is a plain link
    expect(/category=Apparel/.test(await chips.getByRole("link", { name: "Apparel" }).getAttribute("href")), "chip href");
    step(`[${width}] category chips filter the home page`);

    // ----- product page: mug -----
    await page.locator("#products").getByRole("link", { name: /Printed Mug 11oz/ }).first().click();
    await page.waitForURL(/\/p\/printed-mug/);
    await page.getByTestId("gallery-main").waitFor();
    expect(await page.locator('[aria-label="Choose a photo"] button').count() === 2, "two thumbnails");
    await page.getByTestId("gallery-main").focus();
    await page.keyboard.press("ArrowRight");
    expect(await page.locator('[aria-label="Choose a photo"] button[aria-current="true"]').getAttribute("aria-label") === "Show photo 2 of 2", "arrow key moves the gallery");
    expect(await page.getByTestId("tier-table").locator("tbody tr").count() === 3, "tier table has 3 rows");
    await page.getByTestId("tier-table").getByText("Buy more, save more").waitFor();
    expect(await page.getByRole("button", { name: /Request a quote/ }).isVisible(), "quote button");
    // personalisation + counter
    const field = page.locator("#pf-text");
    await field.fill("Sara");
    expect((await page.getByTestId("pf-text-count").innerText()).trim() === "4/24", "counter");
    expect(await field.getAttribute("maxlength") === "24", "maxlength");
    // artwork + preview
    await page.getByRole("region", { name: /Your artwork/ }).getByTestId("file-input").setInputFiles(png);
    await page.getByText("logo.png").first().waitFor();
    await page.locator('[data-testid="artwork-area"] img').waitFor();
    const aria = await page.getByTestId("artwork-preview").getAttribute("aria-label");
    expect(/logo\.png/.test(aria) && /Sara/.test(aria), "preview aria-label: " + aria);
    expect(await page.getByTestId("artwork-preview").getAttribute("role") === "img", "preview role");
    await overflow(page, "mug product");
    await page.screenshot({ path: `/tmp/merch-${width}-mug.png`, fullPage: true });
    // qty 12 -> tier price
    await page.locator('input[name="quantity"]').first().fill("12");
    await page.waitForTimeout(200);
    expect(/AED\s*288/.test((await page.getByTestId("price").innerText()).replace(/,/g, "")) || /288/.test(await page.getByTestId("price").innerText()), "12 × AED 24 = 288 (+ options): " + await page.getByTestId("price").innerText());
    await page.getByTestId("add-to-cart").click();
    await page.waitForURL(/\/cart/);
    await page.getByTestId("cart-details").getByText(/Sara/).waitFor();
    step(`[${width}] mug: gallery, tiers, personalisation, artwork preview, add to cart`);

    // ----- product page: t-shirt (required text + artwork) -----
    await page.goto(`${BASE}/s/${slug}/p/t-shirt`);
    await page.getByTestId("add-to-cart").click();
    await page.getByText(/Please fill in Text under the design/).first().waitFor();
    expect(await page.locator("#pf-text").getAttribute("aria-invalid") === "true", "invalid field marked");
    await page.locator("#pf-text").fill("Team Dubai");
    await page.getByTestId("add-to-cart").click();
    await page.getByText(/upload your artwork/i).first().waitFor();
    expect(page.url().includes("/p/t-shirt"), "blocked until artwork is uploaded");
    await page.getByRole("region", { name: /Your artwork/ }).getByTestId("file-input").setInputFiles(png);
    await page.locator('[data-testid="artwork-area"] img').waitFor();
    await page.getByTestId("add-to-cart").click();
    await page.waitForURL(/\/cart/);
    await page.getByTestId("cart-lines").locator(":scope > li").nth(1).waitFor();
    expect(await page.getByTestId("cart-lines").locator(":scope > li").count() === 2, "two cart lines");
    await overflow(page, "cart");
    step(`[${width}] t-shirt: required text + artwork enforced before add to cart`);

    // ----- checkout (desktop only places the order) -----
    await page.goto(`${BASE}/s/${slug}/checkout`);
    await page.fill('input[name="name"]', "Aisha Test");
    await page.fill('input[name="email"]', "aisha@example.com");
    await page.fill('input[name="phone"]', "+971501234567");
    await page.getByTestId("mode-pickup").click();
    const slotButtons = page.locator('[data-testid="slots"] button');
    await slotButtons.first().waitFor();
    await slotButtons.nth((await slotButtons.count()) - 1).click();
    await overflow(page, "checkout");
    await page.getByText("Name or short text on the mug: Sara").first().waitFor();
    if (!mobile) {
      await page.getByTestId("place-order").click();
      await page.waitForURL(/\/orders\//, { timeout: 30000 });
      await page.reload({ waitUntil: "networkidle" });
      const body = await page.locator("body").innerText();
      expect(/Sara/.test(body) && /Team Dubai/.test(body), "order page shows personalisation: " + body.slice(0, 300));
      globalThis.orderNo = body.match(/[A-Z]{2,4}-\d{4,}/)?.[0];
      expect(globalThis.orderNo, "order number");
      step(`order ${globalThis.orderNo} paid with fake payment`);
    }
    await ctx.close();
  }

  // ---------- owner: order page ----------
  const octx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const admin = await octx.newPage();
  admin.on("pageerror", (e) => errors.push(`admin: ${e.message}`));
  await admin.goto(`${BASE}/login`);
  await admin.fill('input[name="email"]', email); await admin.fill('input[name="password"]', pass);
  await admin.getByRole("button", { name: "Sign in" }).click();
  await admin.waitForURL(/\/admin/);
  await admin.goto(`${BASE}/admin/orders?q=${globalThis.orderNo}`);
  await admin.getByText(globalThis.orderNo).first().click();
  await admin.waitForURL(/\/admin\/orders\/[0-9a-f-]+/);
  const pers = admin.getByTestId("personalisation");
  await pers.first().waitFor();
  const persText = (await pers.allInnerTexts()).join(" ");
  expect(/Sara/.test(persText) && /Team Dubai/.test(persText), "admin personalisation: " + persText);
  await admin.getByRole("link", { name: "logo.png" }).first().waitFor();
  await admin.getByTestId("proof-svg").first().waitFor({ timeout: 15000 });
  const proofs = await admin.getByTestId("merch-proof").count();
  expect(proofs === 2, "a proof per merch line, got " + proofs);
  const [dl] = await Promise.all([admin.waitForEvent("download"), admin.getByTestId("proof-svg").first().click()]);
  const proofSvg = await (await import("fs")).promises.readFile(await dl.path(), "utf8");
  expect(/PRINT PROOF/.test(proofSvg) && /Sara/.test(proofSvg) && /<image href="data:image\/png/.test(proofSvg) && /<image href="data:image\/svg\+xml/.test(proofSvg), "proof svg embeds photo + artwork + text");
  const [dlPng] = await Promise.all([admin.waitForEvent("download"), admin.getByTestId("proof-png").first().click()]);
  expect((await dlPng.suggestedFilename()).endsWith(".png"), "png proof");
  await admin.screenshot({ path: "/tmp/merch-admin-order.png", fullPage: true });
  await overflow(admin, "admin order");
  step("admin order shows personalisation, artwork download and a print proof (SVG + PNG)");

  // ---------- public output never contains cost data ----------
  const urls = ["", "/p/printed-mug", "/p/t-shirt", "/products.json", "/llms.txt", "/cart", "/checkout"].map((p) => `${BASE}/s/${slug}${p}`);
  for (const u of urls) {
    const r = await fetch(u); const t = await r.text();
    if (r.status === 404 && /llms|products\.json/.test(u)) continue; // new shops may not be indexable
    for (const secret of ["11.11", "22.22", "secret-supplier-note", "secret-tee-note", "costPrice", '"internal"']) expect(!t.includes(secret), `${u} leaks ${secret}`);
  }
  const pj = await fetch(`${BASE}/s/${slug}/products.json`);
  if (pj.ok) { const j = await pj.json(); expect(j.products.find((p) => p.slug === "printed-mug")?.category === "Mugs", "products.json has category"); }
  const prodHtml = await (await fetch(`${BASE}/s/${slug}/p/printed-mug`)).text();
  expect((prodHtml.match(/mug2\.svg/g) ?? []).length >= 1 && /application\/ld\+json/.test(prodHtml), "gallery + JSON-LD present");
  expect(/"image":\[[^\]]*mug\.svg[^\]]*mug2\.svg/.test(prodHtml), "JSON-LD lists every gallery image");
  step("public HTML / JSON never contain the cost price or internal notes");

  if (errors.length) { console.log("page errors:", errors); process.exitCode = 1; }
  else console.log("ALL GREEN");
} catch (e) {
  console.error("FAILED:", e.message); process.exitCode = 1;
} finally {
  await browser.close(); imgServer.close();
}
