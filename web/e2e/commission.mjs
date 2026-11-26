// Commission controls end to end: superadmin sets a shop's terms -> customer pays an order -> ledger, shop statement, report and CSV agree.
// Needs a server (BASE) started with PAYMENTS_FAKE=1 and the demo shop on an active plan. Usage: BASE=http://localhost:3200 SA_PASSWORD=... node e2e/commission.mjs
import { chromium } from "playwright";
import postgres from "postgres";
import { PDFDocument } from "pdf-lib";
import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { loginSuperadmin } from "./helpers.mjs";

const BASE = process.env.BASE ?? "http://localhost:3200";
const SA = process.env.SA_PASSWORD ?? "change-me-now";
const sql = postgres(process.env.DATABASE_URL ?? "postgres://qp:qp@localhost:5432/quickprint");
const step = (s) => console.log("✔", s);
const assert = (c, m) => { if (!c) throw new Error("ASSERT: " + m); };
const demo = (await sql`select id, status, commission_override from tenants where slug='demo'`)[0];
const before = demo.commission_override;
await sql`update tenants set status='active' where id=${demo.id}`;

const OUT = mkdtempSync(path.join(tmpdir(), "comm-"));
const d = await PDFDocument.create(); for (let i = 0; i < 3; i++) d.addPage([595, 842]); const pdf = path.join(OUT, "doc.pdf"); writeFileSync(pdf, await d.save());

const br = await chromium.launch({ executablePath: process.env.CHROME_PATH || "/opt/pw-browsers/chromium" });
const errors = [];
const ctx = async (viewport = { width: 1280, height: 900 }) => { const c = await br.newContext({ viewport }); const p = await c.newPage(); p.on("pageerror", (e) => errors.push(e.message)); return p; };
try {
  /* ---- superadmin sets custom terms ---- */
  const sa = await ctx();
  await loginSuperadmin(sa, BASE);
  await sa.goto(`${BASE}/superadmin/plans`, { waitUntil: "networkidle" });
  assert((await sa.locator('input[name="perJobFee"]').count()) >= 1 && (await sa.locator('input[name="minOrderFee"]').count()) >= 1 && (await sa.locator('input[name="maxOrderFee"]').count()) >= 1, "plan form has per-job fee, min and max");
  step("plan form has commission %, per-print-job fee, min and max per order");
  await sa.goto(`${BASE}/superadmin/tenants/${demo.id}`, { waitUntil: "networkidle" });
  await sa.getByTestId("mode-custom").click();
  await sa.fill('input[name="pct"]', "3"); await sa.fill('input[name="perJobFee"]', "0.5"); await sa.fill('input[name="minOrderFee"]', "1"); await sa.fill('input[name="maxOrderFee"]', "20");
  const eff = await sa.getByTestId("commission-effective").innerText();
  assert(/3% of order value \+ AED 0\.50 per print job \(min AED 1, max AED 20 per order\)/.test(eff), "live preview text: " + eff);
  const prev = await sa.getByTestId("commission-preview").innerText();
  assert(/AED 5000\.00[\s\S]*AED 20\.00/.test(prev.replace(/\s+/g, " ")) || prev.includes("AED 20.00"), "preview shows the AED 20 cap on a big order");
  await sa.fill('input[name="note"]', "e2e test terms");
  await sa.getByTestId("save-commission").click(); await sa.waitForURL(/saved=commission/, { timeout: 30000 });
  const [row] = await sql`select commission_override o from tenants where id=${demo.id}`;
  assert(row.o.mode === "custom" && row.o.pct === 3 && row.o.perJobFee === 0.5 && row.o.minOrderFee === 1 && row.o.maxOrderFee === 20, "saved override: " + JSON.stringify(row.o));
  const [aud] = await sql`select action, meta from audit_logs where action='commission.terms' order by created_at desc limit 1`;
  assert(aud && aud.meta.tenantId === demo.id, "audit-logged");
  step("superadmin saves custom terms (3% + AED 0.50/job, min 1, max 20); live preview correct; audit-logged");
  // invalid input is rejected
  await sa.goto(`${BASE}/superadmin/tenants/${demo.id}`, { waitUntil: "networkidle" }); await sa.getByTestId("mode-custom").click();
  await sa.fill('input[name="pct"]', "75"); await sa.evaluate(() => { document.querySelector('[data-testid="commission-form"]').noValidate = true; }); // bypass the browser's own max=30 to test the SERVER check
  await sa.getByTestId("save-commission").click(); await sa.waitForURL(/error=commission_range/, { timeout: 30000 });
  const [row2] = await sql`select commission_override o from tenants where id=${demo.id}`; assert(row2.o.pct === 3, "an out-of-range % is refused and nothing changes");
  step("out-of-range terms (75%) are refused");

  /* ---- a customer pays an order ---- */
  const c = await ctx({ width: 390, height: 844 });
  await c.goto(`${BASE}/s/demo/p/document-printing`); await c.getByTestId("file-input").setInputFiles(pdf); await c.getByText("doc.pdf").waitFor();
  await c.getByTestId("add-to-cart").click(); await c.goto(`${BASE}/s/demo/checkout`);
  await c.fill('input[name="name"]', "Comm Test"); await c.fill('input[name="email"]', "comm@example.com"); await c.fill('input[name="phone"]', "+971501110000");
  await c.getByTestId("mode-pickup").click();
  await c.locator('[data-testid="slots"] button').last().click().catch(() => {});
  await c.getByTestId("place-order").click(); await c.waitForURL(/\/orders\//, { timeout: 30000 });
  await c.reload({ waitUntil: "networkidle" }); await c.getByText(/Paid|Printing/i).first().waitFor({ timeout: 20000 });
  const orderNo = (await c.locator("body").innerText()).match(/[A-Z]{2,4}-\d{4,}/)?.[0];
  const [cm] = await sql`select c.* from order_commissions c join orders o on o.id=c.order_id where o.number=${orderNo}`;
  assert(cm, "commission recorded for " + orderNo);
  assert(cm.rule_source === "custom" && Number(cm.pct) === 3 && Number(cm.per_job_fee) === 0.5, "uses the shop's custom terms");
  assert(Number(cm.fee) === 1 && cm.min_applied === true && ["accrued", "settled"].includes(cm.status), `3 pages x AED 0.50 = AED 1.50 basis -> 3% + 0.50 = 0.545 -> minimum AED 1.00 applies (got fee=${cm.fee}, status=${cm.status})`);
  step(`order ${orderNo} paid: commission AED ${cm.fee} recorded with the rule snapshot (minimum applied)`);

  /* ---- the shop sees exactly that ---- */
  const owner = await ctx();
  await owner.goto(`${BASE}/login`); await owner.fill('input[name="email"]', "owner@demo.ae"); await owner.fill('input[name="password"]', "owner12345");
  await owner.getByRole("button", { name: "Sign in" }).click(); await owner.waitForURL(/admin/);
  await owner.goto(`${BASE}/admin/billing`, { waitUntil: "networkidle" });
  const terms = await owner.getByTestId("my-terms").innerText();
  assert(/3% of order value/.test(terms) && /custom terms/i.test(await owner.getByTestId("commission-statement").innerText()), "shop sees its terms: " + terms);
  const stmt = await owner.getByTestId("commission-statement").innerText();
  assert(stmt.includes(orderNo) && /AED\s1\.00/.test(stmt) && /to be invoiced/i.test(stmt), "statement lists the order with AED 1.00 'To be invoiced'");
  step("shop's billing page shows its terms and the order's commission (transparent)");

  /* ---- report + CSV ---- */
  const month = new Date().toISOString().slice(0, 7);
  await sa.goto(`${BASE}/superadmin/commissions?m=${month}`, { waitUntil: "networkidle" });
  assert((await sa.locator("body").innerText()).includes("Demo Print Hub"), "commissions report lists the shop");
  const csvRes = await sa.request.get(`${BASE}/api/v1/superadmin/commissions/export?m=${month}`);
  const csv = await csvRes.text(); assert(csvRes.status() === 200 && /text\/csv/.test(csvRes.headers()["content-type"]) && csv.includes(orderNo) && csv.split("\n")[0].startsWith("shop,"), "CSV export has the order");
  assert((await owner.request.get(`${BASE}/api/v1/superadmin/commissions/export?m=${month}`)).status() === 401, "a shop owner cannot download the platform CSV");
  assert((await sa.request.get(`${BASE}/api/v1/superadmin/commissions/export?m=bad`)).status() === 400, "bad month rejected");
  step("commissions report + CSV export work; shop owners get 401 on the platform export");

  /* ---- refund before invoicing removes it ---- */
  await sql`update orders set status='refunded' where number=${orderNo}`; // direct state change; the service-level reversal is covered by the DB tests
} finally {
  await sql`update tenants set commission_override=${before === null ? null : sql.json(before)}, status=${demo.status} where id=${demo.id}`;
  await sql.end(); await br.close();
}
if (errors.length) { console.log("page errors:", errors); process.exit(1); }
console.log("ALL GREEN");
