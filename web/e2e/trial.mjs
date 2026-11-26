// Free-trial length is a superadmin setting: the superadmin sets 5 days, the home, pricing, signup and /ar pages show it, a new signup's
// trial ends ~5 days out; 0 days switches to the no-trial wording; then the setting is restored to 7.
// Usage: BASE=http://localhost:3262 SA_PASSWORD=... node e2e/trial.mjs   (server started with PAYMENTS_FAKE=1, REQUIRE_SUPERADMIN_2FA=0, REQUIRE_STEP_UP=0)
import { chromium } from "playwright";
import { BASE, loginSuperadmin, signup, sqlClient } from "./helpers.mjs";

const sql = sqlClient();
const step = (s) => console.log("✔", s);
const assert = (c, m) => { if (!c) throw new Error("ASSERT: " + m); };
const br = await chromium.launch({ executablePath: process.env.CHROME_PATH || "/opt/pw-browsers/chromium" });
const errors = [];
const newPage = async () => { const p = await (await br.newContext({ viewport: { width: 1280, height: 900 } })).newPage(); p.on("pageerror", (e) => errors.push(e.message)); return p; };
const before = (await sql`select value from platform_settings where key='trialDays'`)[0]?.value;

async function setTrial(sa, n) {
  await sa.goto(`${BASE}/superadmin/settings/trial`, { waitUntil: "networkidle" });
  await sa.fill('input[name="trialDays"]', String(n));
  await sa.getByRole("button", { name: /save trial length/i }).click();
  await sa.waitForURL(/saved=1/, { timeout: 30000 });
}
const body = async (path) => { const p = await newPage(); await p.goto(`${BASE}${path}`, { waitUntil: "networkidle" }); const t = await p.locator("body").innerText(); await p.context().close(); return t; };
const paths = ["/", "/pricing", "/signup", "/ar", "/ar/pricing", "/ar/signup"];

try {
  const sa = await newPage();
  await loginSuperadmin(sa);

  // ---- 5 days ----
  await setTrial(sa, 5); step("superadmin set the trial to 5 days");
  for (const p of paths) {
    const t = await body(p);
    const ar = p.startsWith("/ar");
    assert(ar ? /5 أيام/.test(t) : /\b5 days\b/i.test(t), `${p} shows the 5-day trial`);
    assert(!/\b14\b[- ]?(days?|day)|14 يومًا/i.test(t.replace(/last 14 days|آخر 14 يومًا/g, "")), `${p} has no stale 14-day text`);
    assert(!/{trialDays}/.test(t) && !/\|\|0:/.test(t), `${p} shows no raw token`);
  }
  step("home, pricing, signup and the /ar pages show 5 days, no raw tokens");
  const home = await body("/");
  assert(/^5\s*$/m.test(home) || /\b5\s+days free on every plan/i.test(home.replace(/\n/g, " ")), "numeric facts band shows 5");
  for (const p of ["/llms.txt", "/llms-full.txt"]) {
    const t = await (await fetch(`${BASE}${p}`)).text();
    assert(/5 days/.test(t) && !/14-day|14 days/.test(t), `${p} reflects 5 days`);
  }
  step("llms.txt and llms-full.txt reflect 5 days");

  // ---- a new signup gets ~5 days ----
  const pg = await newPage();
  const acc = await signup(pg, { base: BASE });
  const t = (await sql`select status, trial_ends_at from tenants where slug=${acc.slug}`)[0];
  const days = (new Date(t.trial_ends_at) - Date.now()) / 86400000;
  assert(t.status === "trial" && Math.abs(days - 5) < 0.1, "new signup trial ends in ~5 days: " + JSON.stringify(t));
  step("a new signup's trialEndsAt is about 5 days out");

  // ---- 0 days: no-trial wording ----
  await setTrial(sa, 0); step("superadmin set the trial to 0 days");
  for (const p of paths) {
    const t0 = await body(p);
    assert(!/\bfree for 0|0 days|بدون تجربة مجانية: |0 أيام/i.test(t0) || /no free trial|بدون تجربة/.test(t0), `${p} has no "0 days free" wording`);
    assert(!/{trialDays}/.test(t0) && !/\|\|0:/.test(t0), `${p} shows no raw token at 0 days`);
  }
  const home0 = await body("/");
  assert(/card is charged today|Start now/i.test(home0), "home shows the no-trial wording");
  assert(!/\b[1-9]\d? days free/i.test(home0), "home no longer promises free days");
  assert(/ابدأ الآن|يُخصم من بطاقتك اليوم/.test(await body("/ar")), "/ar shows the no-trial wording");
  step("0 days shows the no-trial wording in en and ar");
} finally {
  if (before === undefined) await sql`delete from platform_settings where key='trialDays'`;
  else await sql`update platform_settings set value=${sql.json(before)} where key='trialDays'`;
  // restore through the app too so the running server's 30 s cache is dropped: set 7 via the UI
  try { const sa = await newPage(); await loginSuperadmin(sa); await (async () => { await sa.goto(`${BASE}/superadmin/settings/trial`, { waitUntil: "networkidle" }); await sa.fill('input[name="trialDays"]', "7"); await sa.getByRole("button", { name: /save trial length/i }).click(); await sa.waitForURL(/saved=1/); })(); step("trial restored to 7"); } catch (e) { console.error("restore failed", e.message); }
  await sql.end(); await br.close();
}
if (errors.length) { console.error("page errors:", errors); process.exit(1); }
console.log("trial e2e OK");
