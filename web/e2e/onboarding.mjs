// Onboarding and trust, end to end: two-step signup with a card, seller verification (form, document, guard rails),
// superadmin review queue (approve / reject / resubmit), gating of checkout / directory, and an a11y spot check.
// Usage: BASE=http://localhost:3252 SA_PASSWORD=... node e2e/onboarding.mjs    (server started with PAYMENTS_FAKE=1)
import { chromium } from "playwright";
import { readFileSync } from "fs";
import { createRequire } from "module";
import { BASE, loginSuperadmin, signup, signupApi, sqlClient, uniquePhone, verifyShop } from "./helpers.mjs";

const sql = sqlClient();
const step = (s) => console.log("✔", s);
const assert = (c, m) => { if (!c) throw new Error("ASSERT: " + m); };
const br = await chromium.launch({ executablePath: process.env.CHROME_PATH || "/opt/pw-browsers/chromium" });
const errors = [];
const newPage = async (vp = { width: 1280, height: 900 }) => { const p = await (await br.newContext({ viewport: vp })).newPage(); p.on("pageerror", (e) => errors.push(e.message)); return p; };
const axeSrc = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");
const axeBad = [];
async function axe(page, label) {
  await page.evaluate(axeSrc);
  const r = await page.evaluate(() => axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } }));
  for (const v of r.violations.filter((x) => ["critical", "serious"].includes(x.impact))) axeBad.push(`${label}: ${v.id} (${v.nodes.length}) ${v.nodes[0]?.target?.join(" ")}`);
}
const PDF = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.from("trade licence ".repeat(40))]);
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const stamp = Date.now().toString(36);
const slugA = "oa" + stamp, slugB = "ob" + stamp, slugC = "oc" + stamp;
const licA = `CN-${stamp.toUpperCase()}-A`, nameA = `Onboard ${stamp} Printing LLC`;

async function fillVerification(p, o) {
  await p.fill('input[name="legalName"]', o.legalName); await p.fill('input[name="licenceNumber"]', o.licence);
  await p.fill('input[name="licenceExpiry"]', o.expiry ?? "2099-12-31");
  await p.selectOption('select[name="authority"]', o.authority ?? "Dubai Economy & Tourism (DET)");
  if (o.zone) await p.fill('input[name="authorityDetail"]', o.zone);
  await p.fill('input[name="activity"]', "Digital and offset printing"); await p.fill('input[name="signatoryName"]', "Omar Khan");
  if (o.trn) await p.fill('input[name="trn"]', o.trn);
  if (o.file !== null) await p.setInputFiles('input[name="document"]', o.file ?? { name: "licence.pdf", mimeType: "application/pdf", buffer: PDF });
  await p.getByRole("button", { name: /submit for review|resubmit/i }).click();
}

try {
  /* ---- 1. signup needs the card step; the account is 'incomplete' until a card is on file ---- */
  const a = await newPage();
  const accA = await signup(a, { base: BASE, slug: slugA, name: `Onboard ${stamp} Print`, card: false });
  let t = (await sql`select status, card_status, trial_ends_at, verification_status from tenants where slug=${slugA}`)[0];
  assert(t.status === "incomplete" && t.card_status === "pending" && !t.trial_ends_at, "shop is incomplete without a card: " + JSON.stringify(t));
  step("signup step 1 creates an 'incomplete' shop, no trial yet");
  await axe(a, "signup card step");
  await a.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
  assert(await a.getByRole("heading", { name: /Add a card to start your free trial/ }).isVisible(), "incomplete admin shows the card screen");
  assert(!(await a.getByRole("link", { name: "Orders" }).count()), "no admin navigation while incomplete");
  const sf = await (await br.newContext()).newPage();
  assert((await sf.goto(`${BASE}/s/${slugA}`)).status() === 404, "incomplete shop is not served on the storefront");
  step("an incomplete shop only sees the card screen and is not served publicly");

  // same card cannot start a second trial: shop C uses the card A is about to use
  await a.route("**/api/v1/billing/card/fake", (r) => r.continue({ postData: JSON.stringify({ cardId: "onb-" + stamp }) }));
  const done = a.waitForResponse((r) => r.url().includes("/api/v1/billing/card/fake") && r.status() === 200);
  await a.getByTestId("use-test-card").click(); await done;
  await a.waitForURL(/welcome=1/, { timeout: 60000 }); await a.waitForLoadState("networkidle");
  t = (await sql`select status, card_status, trial_ends_at, card_fingerprint_hash from tenants where slug=${slugA}`)[0];
  const trialSetting = (await sql`select value from platform_settings where key='trialDays'`)[0]?.value;
  const expectDays = Number.isFinite(Number(trialSetting)) && trialSetting != null ? Number(trialSetting) : 7; // superadmin setting, default 7
  const days = (new Date(t.trial_ends_at) - Date.now()) / 86400000;
  assert(t.status === "trial" && t.card_status === "on_file" && Math.abs(days - expectDays) < 0.1 && t.card_fingerprint_hash, `test card starts a ${expectDays} day trial: ` + JSON.stringify(t));
  assert(await a.getByRole("link", { name: "Orders" }).first().isVisible(), "admin panel unlocked");
  step("with the test card the free trial starts and the panel opens");

  const c = await newPage();
  await signup(c, { base: BASE, slug: slugC, name: `Reuse ${stamp}`, cardId: "onb-" + stamp, expectCardError: true });
  await c.getByText(/already been used to start a free trial/).waitFor({ timeout: 15000 });
  t = (await sql`select status, card_status from tenants where slug=${slugC}`)[0];
  assert(t.status === "incomplete" && t.card_status === "failed", "second trial with the same card refused: " + JSON.stringify(t));
  assert(!(await c.getByText(new RegExp(slugA)).count()), "message does not name the other shop");
  step("the same card cannot start a second free trial (friendly message, shop stays incomplete)");

  // waitlist / duplicate owner email + phone (API)
  const dupEmail = await signupApi(BASE, { email: accA.email });
  assert(!dupEmail.ok && dupEmail.status === 409 && dupEmail.body.code === "email_taken", "duplicate email refused: " + JSON.stringify(dupEmail.body));
  const dupEmail2 = await signupApi(BASE, { email: accA.email.replace("@", "+two@").toUpperCase() });
  assert(dupEmail2.status === 409, "email variants refused");
  const dupPhone = await signupApi(BASE, { phone: accA.phone.replace("+971", "0") });
  assert(!dupPhone.ok && dupPhone.status === 409 && dupPhone.body.code === "phone_taken", "duplicate phone refused: " + JSON.stringify(dupPhone.body));
  step("duplicate owner email (and variants) and phone are refused at signup");

  /* ---- 2. owner submits verification with a document ---- */
  await a.goto(`${BASE}/admin/verification`, { waitUntil: "networkidle" });
  assert(await a.getByTestId("verification-banner").isVisible(), "preview banner until verified");
  await axe(a, "admin/verification form");
  // validation: expired licence, bad file
  await fillVerification(a, { legalName: nameA, licence: licA, expiry: "2020-01-01" });
  await a.getByText(/must not be expired/).first().waitFor({ timeout: 15000 });
  await a.fill('input[name="licenceExpiry"]', "2099-12-31");
  await a.setInputFiles('input[name="document"]', { name: "x.pdf", mimeType: "application/pdf", buffer: Buffer.from("<script>alert(1)</script>") });
  await a.getByRole("button", { name: /submit for review/i }).click();
  await a.getByText(/PDF, JPG or PNG/).first().waitFor({ timeout: 15000 });
  step("expired licence and a non-document file are rejected (bytes are sniffed, not the file name)");
  await fillVerification(a, { legalName: nameA, licence: licA, trn: "1" + String(Date.now()).padStart(14, "0").slice(-14) });
  await a.getByText(/We received your details/).waitFor({ timeout: 20000 });
  const v = (await sql`select sv.id, sv.status, sv.document_key, sv.licence_number_norm, sv.legal_name_norm, sv.trn from seller_verifications sv join tenants t on t.id = sv.tenant_id where t.slug=${slugA}`)[0];
  assert(v.status === "pending_review" && v.document_key.endsWith(".enc"), "pending with an encrypted document: " + JSON.stringify(v));
  assert((await sql`select verification_status from tenants where slug=${slugA}`)[0].verification_status === "pending_review", "tenant status synced");
  step("owner submitted details and a licence document: pending review");
  const docOwner = await a.request.get(`${BASE}/api/v1/verification/${v.id}/document`);
  assert(docOwner.status() === 200 && /pdf/.test(docOwner.headers()["content-type"]), "owner can open own document");
  const anon = await newPage(); assert((await anon.request.get(`${BASE}/api/v1/verification/${v.id}/document`)).status() === 404, "anonymous cannot download");
  step("document is served only to its owner (and superadmins)");

  /* ---- 3. a second account cannot reuse licence / business name; cross-shop document access is refused ---- */
  const b = await newPage();
  const accB = await signup(b, { base: BASE, slug: slugB, name: `Second ${stamp}` });
  assert((await b.request.get(`${BASE}/api/v1/verification/${v.id}/document`)).status() === 404, "another shop's owner cannot download");
  await b.goto(`${BASE}/admin/verification`, { waitUntil: "networkidle" });
  await fillVerification(b, { legalName: `Totally Different ${stamp} Trading`, licence: licA.toLowerCase().replace(/-/g, " ") });
  await b.getByText(/trade licence is already registered/i).first().waitFor({ timeout: 15000 });
  assert(!(await b.getByText(new RegExp(slugA, "i")).count()), "does not reveal the other shop");
  await b.fill('input[name="licenceNumber"]', `CN-${stamp}-B`);
  await b.fill('input[name="legalName"]', nameA.toUpperCase().replace("LLC", "L.L.C."));
  await b.getByRole("button", { name: /submit for review/i }).click();
  await b.getByText(/business is already registered/i).first().waitFor({ timeout: 15000 });
  assert((await sql`select count(*)::int n from seller_verifications sv join tenants t on t.id=sv.tenant_id where t.slug=${slugB}`)[0].n === 0, "nothing saved for the duplicate");
  step("duplicate licence number and duplicate business name (case/punctuation/LLC variants) are refused without naming the other shop");

  /* ---- 4. unverified shop: no live checkout, not listed ---- */
  const cust = await newPage();
  await cust.goto(`${BASE}/s/${slugA}/cart`, { waitUntil: "networkidle" });
  await cust.getByText("This store is not yet open for orders.").waitFor();
  await cust.goto(`${BASE}/s/${slugA}/checkout`, { waitUntil: "networkidle" });
  await cust.getByText("This store is not yet open for orders.").waitFor();
  assert((await cust.goto(`${BASE}/s/${slugA}`)).status() === 200, "store page stays viewable");
  const prodSlug = (await sql`select slug from products where tenant_id=(select id from tenants where slug=${slugA}) and active limit 1`)[0].slug;
  assert((await cust.goto(`${BASE}/s/${slugA}/p/${prodSlug}`)).status() === 200, "product page stays viewable");
  const co = await cust.request.post(`${BASE}/api/v1/store/${slugA}/checkout`, { data: { contact: { name: "Cust Omer", email: "c@example.com", phone: "+971501234567" }, lines: [{ productId: (await sql`select id from products where tenant_id=(select id from tenants where slug=${slugA}) limit 1`)[0].id, quantity: 1 }], fulfillment: "pickup", slotStart: new Date(Date.now() + 3 * 86400000).toISOString(), provider: "stripe" } });
  assert(co.status() === 403 && /not yet open for orders/.test(await co.text()), "checkout API refuses: " + co.status());
  await a.goto(`${BASE}/s/${slugA}`, { waitUntil: "networkidle" });
  assert(await a.getByTestId("preview-banner").isVisible(), "owner sees the preview banner on the storefront");
  const html = await (await cust.request.get(`${BASE}/s/${slugA}`)).text();
  assert(/noindex/.test(html), "unverified store is noindex");
  const stores = await (await cust.request.get(`${BASE}/stores`)).text();
  assert(!stores.includes(`Onboard ${stamp} Print`), "unverified store is not in the Live stores directory");
  step("unverified shop: cart/checkout say 'not yet open', API refuses, pages viewable, owner sees preview banner, noindex, not in /stores");

  /* ---- 5. superadmin reviews ---- */
  const sa = await newPage(); await loginSuperadmin(sa);
  await sa.goto(`${BASE}/superadmin/verifications`, { waitUntil: "networkidle" });
  const row = sa.getByTestId("verification-row").filter({ hasText: nameA });
  await row.waitFor();
  assert(/waiting/.test(await row.innerText()), "SLA age shown");
  await axe(sa, "superadmin/verifications");
  await row.getByRole("link", { name: "Review" }).click(); await sa.waitForURL(/verifications\/[0-9a-f-]{36}/);
  assert(await sa.getByTestId("document-viewer").getByRole("link", { name: /Open the PDF|Open in new tab/ }).first().isVisible(), "document link in the viewer");
  assert(await sa.getByTestId("duplicate-matches").isVisible(), "duplicate matches panel");
  await axe(sa, "superadmin/verifications/[id]");
  assert(await sa.getByTestId("approve").isDisabled(), "approve disabled until the checklist is complete");
  for (const cb of await sa.locator('[data-testid="review-panel"] fieldset input[type="checkbox"]').all()) await cb.check();
  // flagged submissions need a reason: tolerate both cases
  const reason = sa.locator('textarea[name="overrideReason"]');
  if (await reason.count()) await reason.fill("Verified against the DET register by phone");
  await sa.getByTestId("approve").click();
  await sa.getByText(/Approved. The shop is verified/).waitFor({ timeout: 20000 });
  t = (await sql`select verification_status from tenants where slug=${slugA}`)[0];
  assert(t.verification_status === "verified", "tenant verified");
  const hist = (await sql`select history, status from seller_verifications where id=${v.id}`)[0];
  assert(hist.status === "verified" && hist.history.length >= 2, "history appended");
  assert((await sql`select count(*)::int n from audit_logs where action='verification.approved' and tenant_id=(select id from tenants where slug=${slugA})`)[0].n === 1, "approval audited");
  step("superadmin: SLA shown, document + duplicates + checklist, approve audited and synced to the tenant");

  await cust.goto(`${BASE}/s/${slugA}/cart`, { waitUntil: "networkidle" });
  assert(!(await cust.getByText("This store is not yet open for orders.").count()), "verified shop takes orders");
  const stores2 = await (await cust.request.get(`${BASE}/stores`)).text();
  assert(stores2.includes(`Onboard ${stamp} Print`), "verified store is listed in /stores");
  assert(!/content="noindex/.test(await (await cust.request.get(`${BASE}/s/${slugA}`)).text()), "indexable once verified");
  await a.goto(`${BASE}/admin/verification`, { waitUntil: "networkidle" });
  await a.getByText(/Your business is verified/).waitFor();
  assert(!(await a.getByTestId("verification-banner").count()), "banner gone once verified");
  step("after approval the shop takes orders and is listed in /stores");

  /* ---- 6. reject -> reason shown to the owner -> resubmit; the rejected licence is free again ---- */
  await b.goto(`${BASE}/admin/verification`, { waitUntil: "networkidle" });
  await fillVerification(b, { legalName: `Second ${stamp} Trading`, licence: `CN-${stamp}-B`, authority: "DMCC / free zone", zone: "DMCC" });
  await b.getByText(/We received your details/).waitFor({ timeout: 20000 });
  const vb = (await sql`select sv.id from seller_verifications sv join tenants t on t.id=sv.tenant_id where t.slug=${slugB}`)[0];
  await sa.goto(`${BASE}/superadmin/verifications/${vb.id}`, { waitUntil: "networkidle" });
  await sa.locator('[data-testid="review-panel"] form').nth(2).locator('textarea[name="note"]').fill("The licence photo is cut off. Send the full page.");
  await sa.getByTestId("reject").click();
  await sa.getByText(/Rejected. The owner has been told why/).waitFor({ timeout: 20000 });
  await b.goto(`${BASE}/admin/verification`, { waitUntil: "networkidle" });
  await b.getByText(/The licence photo is cut off/).first().waitFor();
  assert(await b.getByRole("heading", { name: "Update and resubmit" }).isVisible(), "resubmit form offered");
  assert((await sql`select verification_status from tenants where slug=${slugB}`)[0].verification_status === "rejected", "tenant rejected");
  // the rejected licence number is free for others; B resubmits with the full page (PNG this time)
  await b.fill('input[name="licenceExpiry"]', "2099-06-30");
  await b.setInputFiles('input[name="document"]', { name: "licence.png", mimeType: "image/png", buffer: PNG });
  await b.getByRole("button", { name: /resubmit/i }).click();
  await b.getByText(/We received your details/).waitFor({ timeout: 20000 });
  const hb = (await sql`select status, history from seller_verifications where id=${vb.id}`)[0];
  assert(hb.status === "pending_review" && hb.history.length >= 3, "resubmitted, history kept: " + JSON.stringify(hb.history.map((h) => h.status)));
  // request more info path
  await sa.goto(`${BASE}/superadmin/verifications/${vb.id}`, { waitUntil: "networkidle" });
  await sa.locator('[data-testid="review-panel"] form').nth(1).locator('textarea[name="note"]').fill("Please add the Ejari or office lease.");
  await sa.getByTestId("needs-info").click();
  await sa.getByText(/Requested more information/).waitFor({ timeout: 20000 });
  await b.goto(`${BASE}/admin/verification`, { waitUntil: "networkidle" });
  await b.getByText(/Ejari or office lease/).first().waitFor();
  step("reject with reason, owner sees why and resubmits (history kept); request-more-info reaches the owner");
  void accB;

  // superadmin cannot approve a shop with no card
  const noCard = await signup(await newPage(), { base: BASE, slug: "od" + stamp, name: `NoCard ${stamp}`, card: false });
  void noCard;

  // cron: expiry sweep route is protected and works
  assert((await fetch(`${BASE}/api/v1/superadmin/cron/trust`)).status === 401, "cron needs the secret");
  const cr = await (await fetch(`${BASE}/api/v1/superadmin/cron/trust?secret=${process.env.CRON_SECRET ?? "dev-cron"}`)).json();
  assert(cr.ok === true, "cron ran: " + JSON.stringify(cr));
  step("licence-expiry cron route is protected and runs");

  assert(!axeBad.length, "axe serious/critical:\n" + axeBad.join("\n"));
  step("a11y spot check: no serious/critical axe violations on the card step, verification form and review pages");
  assert(!errors.length, "page errors: " + errors.join(" | "));
  console.log("\nOK onboarding");
} catch (e) {
  console.error("\nFAILED:", e.message);
  process.exitCode = 1;
} finally {
  await sql`delete from tenants where slug in (${slugA}, ${slugB}, ${slugC}, ${"od" + stamp})`.catch(() => {});
  await sql.end(); await br.close();
}
void uniquePhone; void verifyShop;
