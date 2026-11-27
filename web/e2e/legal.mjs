// Legal pages and signup acceptance: the four pages load in EN and AR with the lawyer-review notice and version, the footer links to them,
// signup is blocked without the checkbox (UI and API) and with it a legal_acceptances row is written and shown in /admin/settings.
// Usage: BASE=http://localhost:3281 node e2e/legal.mjs   (server with PAYMENTS_FAKE=1; uses 2 signups from the per-IP hourly limit)
import { chromium } from "playwright";
import { readFileSync } from "fs";
import { createRequire } from "module";
import { BASE, sqlClient, uniquePhone } from "./helpers.mjs";

const axeSrc = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");
const sql = sqlClient();
const step = (s) => console.log("✔", s);
const assert = (c, m) => { if (!c) throw new Error("ASSERT: " + m); };
const br = await chromium.launch({ executablePath: process.env.CHROME_PATH || "/opt/pw-browsers/chromium" });
const errors = [];
const newPage = async () => { const p = await (await br.newContext({ viewport: { width: 1280, height: 900 } })).newPage(); p.on("pageerror", (e) => errors.push(e.message)); return p; };
const DOCS = ["terms", "privacy", "refunds", "seller-agreement"];
const NOTICE = { en: "Template for review: this text must be checked by a UAE lawyer before launch", ar: "نموذج للمراجعة" };

try {
  // ---- pages ----
  const p = await newPage();
  for (const lang of ["en", "ar"]) for (const d of DOCS) {
    const url = `${BASE}${lang === "ar" ? "/ar" : ""}/${d}`;
    const res = await p.goto(url, { waitUntil: "networkidle" });
    assert(res.status() === 200, `${url} -> ${res.status()}`);
    assert(await p.getByTestId("legal-notice").isVisible(), `${url} notice visible`);
    assert((await p.getByTestId("legal-notice").innerText()).includes(NOTICE[lang]), `${url} notice text`);
    assert(/\d{4}-\d{2}-\d{2}/.test(await p.getByTestId("legal-version").innerText()), `${url} version`);
    assert((await p.locator("html").getAttribute("lang")) === lang, `${url} html lang`);
    assert(await p.locator("h1").count() === 1, `${url} one h1`);
    const txt = await p.locator("main").innerText();
    assert(!/\{trialDays\}|\|\|0:/.test(txt), `${url} raw token`);
    assert(/\[/.test(txt), `${url} has bracket placeholders`);
    await p.evaluate(axeSrc);
    const viol = await p.evaluate(() => axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } }).then((r) => r.violations.map((v) => `${v.id} x${v.nodes.length}`)));
    assert(viol.length === 0, `${url} axe: ${viol.join(", ")}`);
    // footer links
    const links = await p.locator("footer a").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
    for (const k of DOCS) assert(links.includes(`${lang === "ar" ? "/ar" : ""}/${k}`), `${url} footer links to ${k}`);
  }
  step("4 pages x EN/AR: 200, notice, version, lang, no raw tokens, axe clean, footer links");
  const html = await (await fetch(`${BASE}/sitemap.xml`)).text();
  for (const d of DOCS) assert(html.includes(`/${d}</loc>`) && html.includes(`/ar/${d}`), `sitemap lists ${d}`);
  step("sitemap lists them with Arabic alternates");

  // ---- signup UI: blocked without the checkbox ----
  const o = await newPage();
  const slug = "lg" + Date.now().toString(36);
  await o.context().setExtraHTTPHeaders({ "x-forwarded-for": `10.3.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` });
  await o.goto(`${BASE}/signup`, { waitUntil: "networkidle" });
  await o.getByPlaceholder("Al Noor Printing").fill(`Legal ${slug}`);
  await o.getByPlaceholder("alnoor").fill(slug);
  await o.getByText("✓ Available").waitFor({ timeout: 15000 });
  await o.fill('input[name="ownerName"]', "Owner"); await o.fill('input[name="phone"]', uniquePhone());
  await o.fill('input[name="email"]', `${slug}@example.com`); await o.fill('input[name="password"]', "pw123456pw");
  const links = o.locator('label:has([data-testid="accept-legal"]) a');
  assert(await links.count() === 3, "three links in the label");
  for (let i = 0; i < 3; i++) assert((await links.nth(i).getAttribute("target")) === "_blank", "links open in a new tab");
  await o.getByRole("button", { name: /continue to card/i }).click();
  await o.getByText(/please tick the box/i).first().waitFor({ timeout: 5000 });
  assert(!(await o.getByTestId("card-step").count()), "still on step 1");
  assert((await sql`select 1 from users where email=${`${slug}@example.com`}`).length === 0, "no account created without acceptance");
  step("UI: signup blocked, friendly message, nothing created");
  // ---- API refuses too ----
  const body = { shopName: "No Accept", slug: slug + "x", ownerName: "Owner", email: `${slug}x@example.com`, phone: uniquePhone(), password: "pw123456pw", emirate: "Dubai", plan: "growth" };
  const r = await fetch(`${BASE}/api/v1/signup`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "10.4.1.1" }, body: JSON.stringify(body) });
  const rj = await r.json();
  assert(r.status === 400 && rj.code === "legal_required" && /accept/i.test(rj.error), "API 400 legal_required: " + JSON.stringify(rj));
  assert((await sql`select 1 from tenants where slug=${slug + "x"}`).length === 0, "API created nothing");
  step("API: 400 with a friendly message and no shop");

  // ---- with the box ticked ----
  await o.getByTestId("accept-legal").check();
  await o.getByRole("button", { name: /continue to card/i }).click();
  await o.getByTestId("card-step").waitFor({ timeout: 60000 });
  const [t] = await sql`select id from tenants where slug=${slug}`;
  const rows = await sql`select * from legal_acceptances where tenant_id=${t.id}`;
  assert(rows.length === 1, "one acceptance row");
  assert(/^\d{4}-\d{2}-\d{2}$/.test(rows[0].version) && rows[0].documents.join() === "terms,privacy,seller-agreement", "version and documents");
  assert(rows[0].ip_hash && !rows[0].ip_hash.includes("10.3") && rows[0].user_agent, "ip hash and user agent");
  assert((await sql`select 1 from audit_logs where tenant_id=${t.id} and action='legal.accepted'`).length === 1, "audited");
  step("accepted signup stores version, documents, hashed IP, user agent and an audit entry");

  // finish the trial, check the owner's settings line and the Arabic form
  await o.getByTestId("use-test-card").click();
  await o.waitForURL(/\/admin/, { timeout: 60000 });
  await o.goto(`${BASE}/admin/settings`, { waitUntil: "networkidle" });
  assert(/accepted version \d{4}-\d{2}-\d{2}/.test(await o.getByTestId("legal-history").innerText()), "settings shows acceptance");
  step("owner sees acceptance history in /admin/settings");

  const a = await newPage();
  await a.goto(`${BASE}/ar/signup`, { waitUntil: "networkidle" });
  const lab = await a.locator('label:has([data-testid="accept-legal"])').innerText();
  assert(/أوافق على/.test(lab) && /اتفاقية البائع/.test(lab), "Arabic checkbox text");
  const hrefs = await a.locator('label:has([data-testid="accept-legal"]) a').evaluateAll((as) => as.map((x) => x.getAttribute("href")));
  assert(hrefs.join() === "/ar/terms,/ar/privacy,/ar/seller-agreement", "Arabic links: " + hrefs);
  step("Arabic signup checkbox and links");
  assert(errors.length === 0, "page errors: " + errors.join("; "));
  console.log("legal e2e OK");
} catch (e) { console.error("FAILED:", e.message); process.exitCode = 1; }
finally { await br.close(); await sql.end(); }
