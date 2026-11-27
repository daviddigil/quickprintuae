// Run with KEEP_COOKIE_NOTICE=1 so helpers do not pre-dismiss the cookie notice.
// UAE compliance surfaces: public pages (EN/AR), cookie notice, report-content flow into the superadmin queue, order page seller identity.
// Usage: BASE=http://localhost:3200 SA_EMAIL=... SA_PASSWORD=... node --import tsx e2e/compliance.mjs
import { chromium } from "playwright";
import { BASE, sqlClient, loginSuperadmin } from "./helpers.mjs";

const sql = sqlClient();
const step = (s) => console.log("✔", s);
const assert = (c, m) => { if (!c) throw new Error("ASSERT: " + m); };
const br = await chromium.launch({ executablePath: process.env.CHROME_PATH || "/opt/pw-browsers/chromium" });
const errors = [];
const newPage = async () => { const p = await (await br.newContext({ viewport: { width: 1280, height: 900 } })).newPage(); p.on("pageerror", (e) => errors.push(e.message)); return p; };
try {
  const p = await newPage();
  for (const path of ["/acceptable-use", "/ar/acceptable-use", "/subprocessors", "/ar/subprocessors", "/report", "/ar/report"]) {
    const r = await p.goto(BASE + path, { waitUntil: "networkidle" });
    assert(r.status() === 200, `${path} -> ${r.status()}`);
    assert((await p.locator("h1").count()) === 1, `${path} one h1`);
  }
  step("AUP, sub-processors and report pages load in EN and AR");

  const c = await newPage();
  await c.goto(BASE + "/", { waitUntil: "networkidle" });
  const notice = c.getByTestId("cookie-notice");
  assert(await notice.isVisible(), "cookie notice shown");
  await notice.getByRole("button").first().click();
  await c.reload({ waitUntil: "networkidle" });
  assert(!(await c.getByTestId("cookie-notice").isVisible().catch(() => false)), "cookie notice stays dismissed");
  step("cookie notice shows once and stays dismissed");

  const marker = `E2E compliance report ${Date.now()}`;
  const r = await p.request.post(`${BASE}/api/v1/report`, { data: { category: "counterfeit", description: marker + " fake brand print", reporterEmail: "reporter@example.com" } });
  assert(r.status() === 200 || r.status() === 201, "report accepted: " + r.status());
  const bot = await p.request.post(`${BASE}/api/v1/report`, { data: { category: "other", description: "bot submission text here", website: "http://spam" } });
  const rows = await sql`select count(*)::int n from content_reports where description like ${marker + "%"}`;
  assert(rows[0].n === 1, "exactly one report stored");
  assert(bot.status() < 500, "honeypot handled");
  step("public report stored; honeypot does not 500");

  const sa = await newPage();
  await loginSuperadmin(sa);
  await sa.goto(`${BASE}/superadmin/reports`, { waitUntil: "networkidle" });
  assert((await sa.getByTestId("report-row").count()) >= 1, "report visible in the superadmin queue");
  for (const path of ["/superadmin/incidents", "/superadmin/privacy-requests", "/superadmin/settings/identity"]) {
    const rr = await sa.goto(BASE + path, { waitUntil: "networkidle" });
    assert(rr.status() === 200, `${path} -> ${rr.status()}`);
  }
  step("superadmin: reports queue, incidents, privacy requests, platform identity");
  assert(errors.length === 0, "page errors: " + errors.join(" | "));
  await sql`delete from content_reports where description like ${marker + "%"}`;
  console.log("\nALL COMPLIANCE E2E CHECKS PASSED");
} finally { await br.close(); await sql.end(); }
