// Seasonal offers end to end: superadmin creates a Black Friday offer with a code -> banner on / and /ar, discounted price on /pricing ->
// a new shop signs up with the code (test card) -> its first invoice shows the discount -> pause hides banner and rejects the code ->
// max redemptions enforced -> axe on the new pages and the banner.
// Usage: BASE=http://localhost:3261 SA_PASSWORD=... node e2e/offers.mjs   (server with PAYMENTS_FAKE=1 REQUIRE_SUPERADMIN_2FA=0 REQUIRE_STEP_UP=0)
import { chromium } from "playwright";
import { readFileSync } from "fs";
import { spawnSync } from "child_process";
import { createRequire } from "module";
import { BASE, loginSuperadmin, login, sqlClient, uniquePhone } from "./helpers.mjs";

const sql = sqlClient();
const step = (s) => console.log("✔", s);
const assert = (c, m) => { if (!c) throw new Error("ASSERT: " + m); };
const br = await chromium.launch({ executablePath: process.env.CHROME_PATH || "/opt/pw-browsers/chromium" });
const errors = [];
const newPage = async () => { const p = await (await br.newContext({ viewport: { width: 1280, height: 900 } })).newPage(); p.on("pageerror", (e) => errors.push(e.message)); return p; };
const axeSrc = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");
const axeBad = [];
async function axe(page, label) {
  await page.evaluate(axeSrc);
  const r = await page.evaluate(() => axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } }));
  for (const v of r.violations.filter((x) => ["critical", "serious"].includes(x.impact))) axeBad.push(`${label}: ${v.id} (${v.nodes.length}) ${v.nodes[0]?.target?.join(" ")}`);
}
const dubaiInput = (ms) => new Date(ms + 4 * 3600_000).toISOString().slice(0, 16);
const stamp = Date.now().toString(36);
const CODE = `BF${stamp}`.toUpperCase();
const NAME = `Black Friday ${stamp}`;
let offerId = null;

async function offerState() { return (await sql`select status, redeemed_count, max_redemptions from offers where id=${offerId}`)[0]; }
async function hasBanner(url) { const p = await newPage(); await p.goto(url, { waitUntil: "networkidle" }); const n = await p.getByTestId("offer-banner").count(); await p.context().close(); return n > 0; }

async function shopSignup(page, { promoFromUrl, slug }) {
  const ip = `10.7.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
  await page.context().setExtraHTTPHeaders({ "x-forwarded-for": ip });
  await page.goto(`${BASE}/signup${promoFromUrl ? `?offer=${promoFromUrl}` : ""}`, { waitUntil: "networkidle" });
  await page.getByPlaceholder("Al Noor Printing").fill(`Shop ${slug}`);
  await page.getByPlaceholder("alnoor").fill(slug);
  await page.getByText("✓ Available").waitFor({ timeout: 15000 });
  await page.fill('input[name="ownerName"]', "Owner"); await page.fill('input[name="phone"]', uniquePhone());
  await page.fill('input[name="email"]', `${slug}@example.com`); await page.fill('input[name="password"]', "pw123456pw");
  await page.selectOption('select[name="plan"]', "growth");
  await page.getByTestId("accept-legal").check();
}
const finishCard = async (page) => { await page.getByRole("button", { name: /continue to card/i }).click(); await page.getByTestId("card-step").waitFor({ timeout: 60000 }); await page.getByTestId("use-test-card").click(); await page.waitForURL(/\/admin/, { timeout: 60000 }); };

try {
  /* ---- 1. superadmin creates the offer ---- */
  const sa = await newPage();
  await loginSuperadmin(sa);
  await sa.goto(`${BASE}/superadmin/offers`, { waitUntil: "networkidle" });
  assert(await sa.getByRole("link", { name: "Offers" }).first().isVisible(), "Offers nav link");
  await axe(sa, "offers list");
  await sa.getByTestId("new-offer").click(); await sa.waitForURL(/offers\/new/);
  await sa.getByTestId("offer-form").waitFor();
  await sa.getByTestId("theme-black_friday").click();
  assert((await sa.getByTestId("f-name").inputValue()).includes("Black Friday"), "preset fills the name");
  await sa.getByTestId("f-name").fill(NAME);
  await sa.getByTestId("f-code").fill(CODE.toLowerCase());
  assert((await sa.getByTestId("f-code").inputValue()) === CODE, "code is upper-cased");
  await sa.getByTestId("f-value").fill("30"); await sa.getByTestId("f-duration").fill("3");
  await sa.getByTestId("f-starts").fill(dubaiInput(Date.now() - 3600_000)); await sa.getByTestId("f-ends").fill(dubaiInput(Date.now() + 7 * 86400_000));
  await sa.getByTestId("f-status").selectOption("active");
  // live preview with real plan prices
  assert((await sa.getByTestId("preview-prices").innerText()).includes("AED"), "preview shows the discounted price table");
  assert((await sa.getByTestId("preview-summary").innerText()).includes("30% off"), "preview summary");
  assert(await sa.getByTestId("offer-banner").first().isVisible(), "banner preview");
  await axe(sa, "new offer form");
  // validation: a bad percent is flagged before saving
  await sa.getByTestId("f-value").fill("150"); await sa.getByTestId("f-value").blur();
  assert(await sa.getByTestId("err-value").isVisible(), "percent > 100 is flagged");
  await sa.getByTestId("f-value").fill("30");
  await sa.getByTestId("save-offer").click(); await sa.waitForURL(/superadmin\/offers\?saved=1/, { timeout: 30000 });
  const row = sa.locator(`[data-testid=offer-row][data-offer-name="${NAME}"]`);
  assert(await row.isVisible(), "offer is listed");
  assert((await row.innerText()).includes("Live"), "state badge says Live");
  offerId = (await sql`select id from offers where name=${NAME}`)[0].id;
  // duplicate code rejected
  await sa.goto(`${BASE}/superadmin/offers/new`, { waitUntil: "networkidle" });
  await sa.getByTestId("f-code").fill(CODE); await sa.getByTestId("f-status").selectOption("draft"); await sa.getByTestId("save-offer").click();
  await sa.getByTestId("err-code").waitFor(); step("superadmin creates a live Black Friday offer with a code; duplicate codes are refused");

  /* ---- 2. public pages ---- */
  const pub = await newPage();
  await pub.goto(`${BASE}/`, { waitUntil: "networkidle" });
  const banner = pub.getByTestId("offer-banner").first();
  assert(await banner.isVisible(), "banner on home");
  const bt = await banner.innerText(); assert(bt.includes(CODE) && bt.includes("30% off"), "banner text: " + bt);
  await axe(pub, "home with banner");
  await pub.goto(`${BASE}/ar`, { waitUntil: "networkidle" });
  const barText = await pub.getByTestId("offer-banner").first().innerText();
  assert(/خصم/.test(barText) && barText.includes(CODE), "Arabic banner: " + barText);
  assert((await pub.getByTestId("offer-banner").first().getAttribute("dir")) === "rtl", "banner is rtl in /ar");
  await axe(pub, "ar home with banner");
  await pub.goto(`${BASE}/pricing`, { waitUntil: "networkidle" });
  assert(await pub.getByTestId("offer-banner").first().isVisible(), "banner on pricing");
  const price = pub.getByTestId("offer-price").first();
  assert(await price.isVisible(), "pricing shows the discounted price");
  assert((await price.locator("s").count()) === 1, "struck-through list price");
  await axe(pub, "pricing with offer");
  await pub.goto(`${BASE}/ar/pricing`, { waitUntil: "networkidle" }); assert(await pub.getByTestId("offer-price").first().isVisible(), "ar pricing shows the offer price");
  await pub.goto(`${BASE}/signup`, { waitUntil: "networkidle" }); assert(await pub.getByTestId("offer-banner").isVisible(), "banner on signup");
  step("banner on home, /ar, pricing and signup; struck-through and discounted prices");

  /* ---- 3. a new shop signs up with the code ---- */
  const slug = "of" + stamp;
  const p = await newPage();
  await shopSignup(p, { promoFromUrl: CODE, slug });
  assert((await p.getByTestId("promo-input").inputValue()) === CODE, "code prefilled from ?offer=");
  await p.getByTestId("promo-applied").waitFor();
  assert((await p.getByTestId("promo-applied").innerText()).includes("30% off"), "discount shown before the card step");
  await axe(p, "signup with promo");
  await finishCard(p);
  const red = (await sql`select r.status, r.months_remaining, r.terms from offer_redemptions r join tenants t on t.id=r.tenant_id where t.slug=${slug} and r.offer_id=${offerId}`)[0];
  assert(red && red.status === "active" && red.months_remaining === 3 && red.terms.kind === "percent", "redeemed at card completion: " + JSON.stringify(red));
  assert((await offerState()).redeemed_count === 1, "redeemedCount = 1");
  // an abandoned signup (no card) burns nothing
  const ab = await newPage(); await shopSignup(ab, { promoFromUrl: CODE, slug: "ab" + stamp });
  await ab.getByRole("button", { name: /continue to card/i }).click(); await ab.getByTestId("card-step").waitFor({ timeout: 60000 });
  assert((await offerState()).redeemed_count === 1, "abandoned signup does not redeem");
  step("shop signs up with the code; redeemed only when the card step completes");

  /* ---- 4. its first invoice carries the discount ---- */
  await sql`update tenants set status='active' where slug=${slug}`;
  const tid = (await sql`select id from tenants where slug=${slug}`)[0].id;
  const run = spawnSync("node", ["--conditions=react-server", "--import", "tsx", "--input-type=module", "-e", `import { generateInvoicesForPeriod } from "./src/server/billing/index.ts"; const r = await generateInvoicesForPeriod(new Date(), { tenantId: ${JSON.stringify(tid)} }); console.log("INV", r.length); process.exit(0)`], { encoding: "utf8", env: process.env });
  assert(/INV 1/.test(run.stdout), "invoice generated: " + run.stdout + run.stderr.slice(-300));
  const inv = (await sql`select subscription_amount, discount_amount, vat, total, discount_detail from saas_invoices where tenant_id=${tid}`)[0];
  assert(Math.abs(inv.discount_amount - Math.round(inv.subscription_amount * 0.3 * 100) / 100) < 0.011, "30% of the subscription: " + JSON.stringify(inv));
  assert(Math.abs(inv.total - (inv.subscription_amount - inv.discount_amount) * 1.05) < 0.02, "VAT on the discounted net");
  assert(inv.discount_detail[0].name === NAME, "discount detail names the offer");
  const owner = await newPage(); await login(owner, `${slug}@example.com`, "pw123456pw"); await owner.waitForURL(/\/admin/);
  await owner.goto(`${BASE}/admin/billing`, { waitUntil: "networkidle" });
  assert((await owner.getByTestId("invoice-discount").first().innerText()).includes("−"), "owner invoice table shows the discount");
  assert(await owner.getByTestId("my-offer").first().isVisible(), "owner sees the offer in the offers card");
  await axe(owner, "admin billing with offers");
  await sa.goto(`${BASE}/superadmin/invoices`, { waitUntil: "networkidle" });
  assert((await sa.getByTestId("invoice-discount").first().innerText()).includes("−") || (await sa.locator("td[data-testid=invoice-discount]").allInnerTexts()).some((x) => x.includes("−")), "superadmin invoice list shows the discount");
  await sa.goto(`${BASE}/superadmin/offers/${offerId}`, { waitUntil: "networkidle" });
  assert((await sa.getByTestId("redemptions").innerText()).includes(`Shop ${slug}`), "redemptions list names the shop");
  step("first invoice has the discount before VAT; visible to owner and superadmin; redemptions list shows the shop");

  /* ---- 5. pause hides the banner and rejects the code ---- */
  await sa.goto(`${BASE}/superadmin/offers`, { waitUntil: "networkidle" });
  await sa.locator(`[data-testid=offer-row][data-offer-name="${NAME}"]`).getByRole("button", { name: "Pause" }).click(); await sa.waitForURL(/saved=1/);
  assert(!(await hasBanner(`${BASE}/`)), "paused: banner hidden");
  const rej = await (await fetch(`${BASE}/api/v1/offers/validate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: CODE, plan: "growth" }) })).json();
  assert(rej.ok === false && /isn't valid/.test(rej.error) && !JSON.stringify(rej).includes(NAME), "paused: code rejected without revealing anything: " + JSON.stringify(rej));
  const rej2 = await fetch(`${BASE}/api/v1/signup`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "10.9.1.2" }, body: JSON.stringify({ shopName: "X Shop", slug: "x" + stamp, ownerName: "O", email: `x${stamp}@example.com`, phone: uniquePhone(), password: "pw123456pw", emirate: "Dubai", plan: "growth", acceptLegal: true, promoCode: CODE }) });
  assert(rej2.status === 400, "signup with a paused code is refused");
  await sa.locator(`[data-testid=offer-row][data-offer-name="${NAME}"]`).getByRole("button", { name: "Resume" }).click(); await sa.waitForURL(/saved=1/);
  assert(await hasBanner(`${BASE}/`), "resumed: banner back");
  step("pause hides the banner and rejects the code; resume restores both");

  /* ---- 6. max redemptions + ended ---- */
  await sql`update offers set max_redemptions=1 where id=${offerId}`;
  const full = await (await fetch(`${BASE}/api/v1/offers/validate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: CODE, plan: "growth" }) })).json();
  assert(full.ok === false && full.reason === "sold_out", "sold out: " + JSON.stringify(full));
  await sa.goto(`${BASE}/superadmin/offers`, { waitUntil: "networkidle" });
  assert((await sa.locator(`[data-testid=offer-row][data-offer-name="${NAME}"]`).innerText()).includes("Sold out"), "state badge: sold out");
  // the limit also holds when a pending signup tries to redeem after the offer filled up
  // the live-offer list is cached ~30 s per process (SQL edits bypass the in-app cache clear), so poll
  let hidden = false; for (let i = 0; i < 14 && !hidden; i++) { hidden = !(await hasBanner(`${BASE}/`)); if (!hidden) await new Promise((r) => setTimeout(r, 3000)); }
  assert(hidden, "sold out: banner hidden");
  await sql`update offers set max_redemptions=null, ends_at=now() - interval '1 minute' where id=${offerId}`;
  const ended = await (await fetch(`${BASE}/api/v1/offers/validate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: CODE, plan: "growth" }) })).json();
  assert(ended.ok === false && ended.reason === "expired", "ended: " + JSON.stringify(ended));
  step("max redemptions and end date are enforced");

  assert(!errors.length, "page errors: " + errors.join(" | "));
  assert(!axeBad.length, "axe: " + axeBad.join("; "));
  console.log("\n✔ offers e2e passed");
} catch (e) {
  console.error("\n✘", e.message); process.exitCode = 1;
} finally {
  if (offerId) await sql`delete from offers where id=${offerId}`;
  await sql`delete from offers where code=${CODE}`;
  await br.close(); await sql.end();
}
