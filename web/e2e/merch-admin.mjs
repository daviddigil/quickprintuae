// Owner builds a custom product from scratch (guided builder), adds a template, edits, duplicates, and the cost never reaches the storefront.
// Usage: BASE=http://localhost:3241 node e2e/merch-admin.mjs   (server started with PAYMENTS_FAKE=1; DATABASE_URL like the other e2e scripts)
import { chromium } from "playwright";
import postgres from "postgres";
import { deflateSync } from "zlib";
import { signup } from "./helpers.mjs";

const BASE = process.env.BASE ?? "http://localhost:3200";
const sql = postgres(process.env.DATABASE_URL ?? "postgres://qp:qp@localhost:5432/quickprint");
const step = (s) => console.log("✔", s);
const assert = (c, m) => { if (!c) throw new Error("ASSERT: " + m); };

// tiny solid-colour PNG generator (no deps)
const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
const png = (r, g, b, w = 60, h = 60) => {
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: w }, () => [r, g, b]).flat())]);
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(Buffer.concat(Array(h).fill(row)))), chunk("IEND", Buffer.alloc(0))]);
};

const br = await chromium.launch({ executablePath: process.env.CHROME_PATH || "/opt/pw-browsers/chromium" });
const errors = [];
const slug = "ma" + Date.now().toString(36);
const NOTE = "SECRET-SUPPLIER-NOTE-" + slug;
try {
  const ctx = await br.newContext({ viewport: { width: 1280, height: 900 } });
  const o = await ctx.newPage(); o.on("pageerror", (e) => errors.push(e.message));
  await signup(o, { base: BASE, slug, name: "Merch Admin Shop" });
  step("signed up " + slug);

  // ---- list page: add menu ----
  await o.goto(`${BASE}/admin/products`, { waitUntil: "networkidle" });
  await o.getByTestId("add-product-menu").click();
  assert(await o.getByRole("link", { name: "Build from scratch" }).isVisible(), "build from scratch link");
  const groups = await o.locator("#tpl optgroup").evaluateAll((els) => els.map((e) => e.label));
  assert(groups.join() === "Print,Merchandise,Gifts", "template optgroups: " + groups);
  step("add menu offers templates (Print/Merchandise/Gifts) and build from scratch");

  // ---- builder ----
  await o.getByRole("link", { name: "Build from scratch" }).click(); await o.waitForURL(/products\/new/);
  await o.getByTestId("b-name").fill("Printed Mug");
  await o.getByTestId("b-category").fill("Mugs");
  await o.getByTestId("b-next").click();

  await o.getByRole("heading", { name: /2\. Photos/ }).waitFor();
  await o.getByTestId("photo-input").setInputFiles([{ name: "a.png", mimeType: "image/png", buffer: png(200, 60, 60) }, { name: "b.png", mimeType: "image/png", buffer: png(60, 60, 200) }]);
  await o.locator('[data-testid="photo-list"] li').nth(1).waitFor({ timeout: 20000 });
  assert((await o.locator('[data-testid="photo-list"] li').count()) === 2, "two photos uploaded");
  const firstSrc = await o.locator('[data-testid="photo-list"] img').first().getAttribute("src");
  await o.getByRole("button", { name: "Make photo 2 the cover" }).click();
  const newFirst = await o.locator('[data-testid="photo-list"] img').first().getAttribute("src");
  assert(newFirst !== firstSrc && /\/api\/product-images\//.test(newFirst), "cover changed");
  const imgRes = await ctx.request.get(BASE + newFirst);
  assert(imgRes.ok() && imgRes.headers()["content-type"] === "image/png", "uploaded photo is served as png");
  assert((await ctx.request.get(BASE + "/api/product-images/..%2F..%2Fetc%2Fpasswd")).status() === 404, "path tricks 404");
  step("two photos uploaded, reordered, served publicly with image/png");
  await o.getByTestId("b-next").click();

  await o.getByRole("heading", { name: /3\. Pricing/ }).waitFor();
  await o.getByTestId("cost-input").fill("11");
  await o.getByTestId("suggested-price").waitFor();
  assert(/22\.00/.test(await o.getByTestId("suggested-price").innerText()), "suggested price at 50% margin on cost 11 is 22");
  const row0 = o.getByTestId("tier-row").first();
  assert(/Healthy/.test(await row0.innerText()), "29 on cost 11 is healthy: " + await row0.innerText());
  await o.getByRole("button", { name: "Add tier" }).click();
  const row1 = o.getByTestId("tier-row").nth(1);
  await row1.locator("input").nth(0).fill("12"); await row1.locator("input").nth(1).fill("12");
  assert(/Thin/.test(await row1.innerText()), "12 on cost 11 is thin: " + await row1.innerText());
  await row1.locator("input").nth(1).fill("9");
  assert(/Loss/.test(await row1.innerText()), "9 on cost 11 is a loss");
  await row1.locator("input").nth(1).fill("24");
  await o.getByPlaceholder("Supplier, SKU, reorder link…").fill(NOTE);
  step("pricing: tiers, cost, suggested price and margin tone");
  await o.getByTestId("b-next").click();

  await o.getByRole("heading", { name: /4\. Options/ }).waitFor();
  await o.getByRole("button", { name: /T-shirt sizes/ }).click();
  assert((await o.getByTestId("option-group").count()) === 1, "size group added");
  await o.getByTestId("b-next").click();

  await o.getByRole("heading", { name: /5\. Personalisation/ }).waitFor();
  await o.getByRole("button", { name: "Add a text field" }).click();
  await o.getByLabel("Label shown to customer").fill("Name on mug");
  await o.getByLabel("Key").fill("name_on_mug");
  await o.getByLabel("Max characters").fill("24");
  await o.getByLabel("Customer artwork upload").selectOption("optional");
  await o.getByRole("switch", { name: /live preview/ }).click();
  await o.getByTestId("mockup-rect").waitFor();
  for (const [k, v] of [["x", "20"], ["y", "25"], ["w", "50"], ["h", "40"]]) await o.getByTestId(`mockup-${k}`).fill(v);
  // keyboard nudge on the rectangle
  await o.getByTestId("mockup-rect").focus(); await o.keyboard.press("ArrowRight");
  assert((await o.getByTestId("mockup-x").inputValue()) === "21", "arrow key moves the print area");
  // drag moves it too
  await o.getByTestId("mockup-stage").scrollIntoViewIfNeeded(); await o.evaluate(() => window.scrollBy(0, 300));
  const stage = await o.getByTestId("mockup-stage").boundingBox(); const rect = await o.getByTestId("mockup-rect").boundingBox();
  await o.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2); await o.mouse.down(); await o.mouse.move(rect.x + rect.width / 2 + stage.width * 0.1, rect.y + rect.height / 2, { steps: 5 }); await o.mouse.up();
  const xAfter = Number(await o.getByTestId("mockup-x").inputValue());
  assert(xAfter > 28 && xAfter < 33, "drag moved the print area by ~10%: " + xAfter);
  await o.getByTestId("mockup-x").fill("20");
  step("personalisation field, artwork optional, print area (numeric, keyboard, drag)");
  await o.getByTestId("b-next").click();

  await o.getByRole("heading", { name: /6\. Review/ }).waitFor();
  await o.getByLabel("Name on mug").fill("Aisha");
  assert(/29\.00/.test(await o.getByTestId("preview-total").innerText()), "preview total for qty 1 is 29: " + await o.getByTestId("preview-total").innerText());
  await o.getByTestId("preview-qty").fill("12");
  assert(/288\.00/.test(await o.getByTestId("preview-total").innerText()), "12 x 24 = 288");
  await o.getByRole("switch", { name: /Request a quote/ }).click();
  await o.getByTestId("b-publish").click();
  await o.waitForURL(/admin\/products\?ok=/, { timeout: 30000 });
  await o.getByTestId("product-row").filter({ hasText: "Printed Mug" }).waitFor();
  step("published from the review step with live price preview");

  const [mug] = await sql`select p.id, p.active, p.kind, p.category, p.image_url, p.images, p.internal, p.config from products p join tenants t on t.id=p.tenant_id where t.slug=${slug} and p.slug='printed-mug'`;
  assert(mug && mug.active && mug.kind === "merchandise" && mug.category === "Mugs", "mug row");
  assert(mug.image_url === newFirst && mug.images.length === 1, "cover + 1 extra image saved");
  assert(Number(mug.internal.costPrice) === 11 && mug.internal.note === NOTE, "cost + note saved in internal");
  assert(mug.config.personalisation.fields[0].key === "name_on_mug" && mug.config.mockup.enabled && mug.config.mockup.x === 20 && mug.config.quote.enabled, "config saved");
  step("DB: internal.costPrice, images, personalisation, mockup, quote saved");

  // ---- category tabs + template + search ----
  await o.goto(`${BASE}/admin/products`, { waitUntil: "networkidle" });
  await o.getByTestId("add-product-menu").click();
  await o.locator("#tpl").selectOption("t-shirt");
  await o.getByRole("button", { name: "Add from template" }).click();
  await o.waitForURL(/admin\/products\/[0-9a-f-]{36}$/, { timeout: 30000 });
  step("T-shirt template added");

  // ---- edit the mug ----
  await o.goto(`${BASE}/admin/products/${mug.id}`, { waitUntil: "networkidle" });
  assert((await o.getByTestId("cost-input").inputValue()) === "11", "editor shows saved cost");
  await o.getByTestId("cost-input").fill("12.5");
  await o.getByTestId("e-category").fill("Drinkware");
  await o.getByTestId("save-product").click();
  await o.getByText("Saved", { exact: true }).waitFor({ timeout: 15000 });
  const [after] = await sql`select category, internal from products where id=${mug.id}`;
  assert(after.category === "Drinkware" && Number(after.internal.costPrice) === 12.5, "edit saved: " + JSON.stringify(after));
  step("edit saved cost price and category");

  await o.goto(`${BASE}/admin/products`, { waitUntil: "networkidle" });
  await o.getByRole("link", { name: /^Drinkware \(1\)/ }).click(); await o.waitForURL(/cat=Drinkware/);
  assert((await o.getByTestId("product-row").count()) === 1, "category tab filters");
  await o.goto(`${BASE}/admin/products?q=shirt`, { waitUntil: "networkidle" });
  assert((await o.getByTestId("product-row").count()) === 1, "search filters");
  await o.goto(`${BASE}/admin/products`, { waitUntil: "networkidle" });
  await o.getByRole("button", { name: "Duplicate Printed Mug" }).click();
  await o.waitForURL(/admin\/products\/[0-9a-f-]{36}$/);
  const [dup] = await sql`select p.name, p.active, p.internal from products p join tenants t on t.id=p.tenant_id where t.slug=${slug} and p.slug='printed-mug-copy'`;
  assert(dup && !dup.active && Number(dup.internal.costPrice) === 12.5, "duplicate is a draft with the same data");
  step("category tabs, search and duplicate work");

  // ---- privacy: storefront must never carry cost/note ----
  const cust = await br.newContext(); const pg = await cust.newPage();
  const resp = await pg.goto(`${BASE}/s/${slug}/p/printed-mug`, { waitUntil: "networkidle" });
  const html = await resp.text();
  assert(resp.status() === 200, "storefront product page loads: " + resp.status());
  for (const bad of ["costPrice", NOTE, '"internal"']) assert(!html.includes(bad), `storefront HTML leaks "${bad}"`);
  const home = await (await cust.request.get(`${BASE}/s/${slug}`)).text();
  assert(!home.includes("costPrice") && !home.includes(NOTE), "storefront home leaks nothing");
  step("cost price and note are absent from the public storefront HTML");

  // mobile smoke: builder usable at 390px
  const m = await (await br.newContext({ viewport: { width: 390, height: 800 }, hasTouch: true, storageState: await ctx.storageState() })).newPage();
  await m.goto(`${BASE}/admin/products/new`, { waitUntil: "networkidle" });
  const overflow = await m.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  assert(!overflow, "no horizontal overflow on mobile");
  const small = await m.locator("main button:visible, main a:visible").evaluateAll((els) => els.filter((e) => { const r = e.getBoundingClientRect(); return r.height < 43.5 && r.height > 0; }).map((e) => e.textContent?.trim().slice(0, 20)));
  assert(small.length === 0, "all builder controls >= 44px on touch: " + small.join("|"));
  step("builder fits a 390px phone with 44px targets");

  assert(!errors.length, "page errors: " + errors.join("; "));
  console.log("\nALL MERCH-ADMIN CHECKS PASSED");
} finally {
  await sql`delete from tenants where slug=${slug}`;
  await br.close(); await sql.end();
}
