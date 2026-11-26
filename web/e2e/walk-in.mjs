// End-to-end: walk-in QR queue. Customer (phone viewport) -> pay -> shop dashboard -> REAL print agent CLI (fake printer) -> status page.
// Needs a running server (BASE, default http://localhost:3200) started with PAYMENTS_FAKE=1 and the demo shop's walk-in enabled.
import { chromium } from "playwright";
import { PDFDocument } from "pdf-lib";
import { execFileSync } from "child_process";
import { mkdtempSync, writeFileSync, readdirSync, statSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { loginSuperadmin } from "./helpers.mjs";

const BASE = process.env.BASE ?? "http://localhost:3200";
const OUT = process.env.OUT ?? mkdtempSync(path.join(tmpdir(), "wi-"));
const AGENT = path.resolve("../print-agent/agent.mjs");
const step = (s) => console.log("✔", s);
const assert = (c, m) => { if (!c) throw new Error("ASSERT: " + m); };
const phone = "05" + String(Math.floor(Math.random() * 9e7) + 1e7).padStart(8, "0").slice(0, 8); // fresh walk-in number each run
const e164 = "+971" + phone.slice(1);

async function pdf(pages, name) {
  const d = await PDFDocument.create(); for (let i = 0; i < pages; i++) d.addPage([595, 842]);
  const p = path.join(OUT, name); writeFileSync(p, await d.save()); return p;
}
const big = await pdf(12, "report-12p.pdf"), small = await pdf(1, "form-1p.pdf");

const br = await chromium.launch({ executablePath: process.env.CHROME_PATH || "/opt/pw-browsers/chromium" });
const errors = [];
const mk = async (opts = {}) => { const c = await br.newContext({ viewport: { width: 1280, height: 900 }, ...opts }); const p = await c.newPage(); p.on("pageerror", (e) => errors.push(e.message)); return p; };

async function walkIn(page, name, files) {
  await page.goto(`${BASE}/s/demo/walk-in`);
  await page.getByTestId("step-1").waitFor();
  await page.fill('input[name="name"]', name); await page.fill('input[name="phone"]', phone);
  await page.getByTestId("start").click();
  await page.getByTestId("step-2").waitFor();
  await page.getByTestId("file-input").setInputFiles(files);
  await page.getByTestId("file-card").nth(files.length - 1).waitFor({ timeout: 30000 });
  await page.waitForFunction((n) => document.querySelectorAll('[data-testid="file-card"]').length === n, files.length);
  const total = await page.getByTestId("total").innerText();
  await page.getByTestId("to-pay").click();
  await page.getByTestId("step-3").waitFor();
  await page.getByTestId("pay").click();
  await page.waitForURL(/walk-in\/status\//, { timeout: 30000 });
  await page.getByTestId("ticket-no").waitFor();
  return { total, ticket: await page.getByTestId("ticket-no").innerText() };
}

// ---- shop owner: create a print agent through the UI ----
const owner = await mk();
await owner.goto(`${BASE}/login`); await owner.fill('input[name="email"]', "owner@demo.ae"); await owner.fill('input[name="password"]', "owner12345");
await owner.getByRole("button", { name: "Sign in" }).click(); await owner.waitForURL(/admin/);
await owner.goto(`${BASE}/admin/walk-in`, { waitUntil: "networkidle" });
await owner.getByPlaceholder("e.g. Front counter PC").fill("E2E counter PC");
await owner.getByTestId("add-agent").click();
const key = (await owner.getByTestId("agent-key").innerText()).trim();
assert(/^qpa_/.test(key), "agent key shown once");
step(`owner created print agent (${key.slice(0, 8)}…)`);

// ---- customer 1: big job first, then customer 2: tiny job (should print first thanks to small-job boost) ----
const c1 = await mk({ viewport: { width: 390, height: 844 }, isMobile: true });
const a = await walkIn(c1, "Aisha E2E", [big]);
step(`customer paid ${a.total}; ticket ${a.ticket}; phone ${phone}`);
await c1.getByTestId("status-card").waitFor();
assert((await c1.getByTestId("status-card").getAttribute("data-state")) === "waiting", "customer sees waiting state");
await c1.screenshot({ path: `${OUT}/status-waiting.png` });

const c2 = await mk({ viewport: { width: 390, height: 844 }, isMobile: true });
const b = await walkIn(c2, "Aisha E2E", [small]);
step(`same phone, second visit; ticket ${b.ticket}`);
const stateB = await c2.getByTestId("status-card").getAttribute("data-state"); assert(stateB === "waiting", "second order waiting");
const titleB = await c2.getByTestId("status-title").innerText(); console.log("  second customer sees:", JSON.stringify(titleB));

// ---- shop dashboard shows both, tiny job (priority High) ahead of the 12-page one ----
await owner.goto(`${BASE}/admin/walk-in`, { waitUntil: "networkidle" });
const rows = await owner.locator('[data-testid="sec-next"] tbody tr').allInnerTexts();
const mine = rows.filter((r) => /form-1p|report-12p/.test(r));
assert(mine.length >= 2, "both files in 'Up next': " + JSON.stringify(rows));
assert(mine.findIndex((r) => /form-1p/.test(r)) < mine.findIndex((r) => /report-12p/.test(r)), "small job is ahead of the large one");
await owner.screenshot({ path: `${OUT}/admin-queue.png`, fullPage: true });
step("shop dashboard lists both jobs, 1-page job first");

// ---- the REAL print agent (fake printer dir) drains the queue ----
const fake = mkdtempSync(path.join(tmpdir(), "printer-"));
for (let i = 0; i < 20; i++) { // other demo jobs may exist; loop until our two are printed
  execFileSync("node", [AGENT, "--server", BASE, "--key", key, "--fake-printer", fake, "--once"], { stdio: "pipe", timeout: 60000 });
  const names = readdirSync(fake).join(" ");
  if (/form-1p/.test(names) && /report-12p/.test(names)) break;
}
const printed = readdirSync(fake);
assert(printed.some((f) => /form-1p/.test(f)) && printed.some((f) => /report-12p/.test(f)), "agent printed both files: " + printed);
const mtime = (re) => statSync(path.join(fake, printed.find((f) => re.test(f) && !f.endsWith(".json")))).mtimeMs;
assert(mtime(/form-1p/) < mtime(/report-12p/), "the 1-page job was printed BEFORE the 12-page job that was queued earlier");
step(`print agent printed ${printed.filter((f) => !f.endsWith(".json")).length} file(s) to the fake printer`);

// ---- customer status page flips to Ready by itself (polling) ----
await c1.waitForFunction(() => document.querySelector('[data-testid="status-card"]')?.getAttribute("data-state") === "ready", null, { timeout: 30000 });
await c2.waitForFunction(() => document.querySelector('[data-testid="status-card"]')?.getAttribute("data-state") === "ready", null, { timeout: 30000 });
await c1.screenshot({ path: `${OUT}/status-ready.png` });
step("both customers' status pages updated to Ready by polling");

// ---- shop: customer saved by phone with 2 visits; orders marked ready; dashboard 'recently printed' ----
await owner.goto(`${BASE}/admin/customers?q=${encodeURIComponent(phone.slice(1))}`, { waitUntil: "networkidle" });
const custText = await owner.locator("body").innerText();
assert(custText.includes(e164) || custText.includes(phone.slice(1)), "walk-in customer saved with phone");
assert(/Aisha E2E/.test(custText), "name saved");
assert(/\b2\b/.test(custText), "two visits counted");
step(`customer saved by phone ${e164} with 2 visits`);
await owner.goto(`${BASE}/admin/walk-in`, { waitUntil: "networkidle" });
assert((await owner.getByTestId("sec-recent").innerText()).includes("form-1p"), "recently printed shows the job");
step("dashboard moved jobs to 'Recently printed'");

// ---- superadmin sees platform stats and can open the queue as the shop ----
const sa = await mk();
await loginSuperadmin(sa, BASE);
assert(/Walk-in jobs/i.test(await sa.locator("body").innerText()), "superadmin shows walk-in tiles");
await sa.screenshot({ path: `${OUT}/superadmin.png`, fullPage: true });
step("superadmin dashboard shows walk-in tiles");

// ---- security: wrong key, no key, wrong token ----
const bad = await fetch(`${BASE}/api/v1/agent/claim`, { method: "POST", headers: { authorization: "Bearer qpa_" + "x".repeat(32), "content-type": "application/json" }, body: "{}" });
assert(bad.status === 401, "bad agent key => 401 (got " + bad.status + ")");
const url = c1.url().replace(/t=[^&]+/, "t=wrongtoken");
const r = await fetch(url.replace("/s/demo/walk-in/status/", "/api/v1/store/demo/walk-in/orders/").replace(/\?/, "/status?"));
assert(r.status === 404 || r.status === 403, "wrong order token rejected (got " + r.status + ")");
step("bad agent key => 401; wrong order token rejected");

await br.close();
if (errors.length) { console.log("page errors:", errors); process.exit(1); }
console.log("ALL GREEN — artifacts in", OUT);
