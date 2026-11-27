// Money flow end to end with FAKE gateways (server must run with PAYMENTS_FAKE=1):
// superadmin configures a gateway -> shop owner saves payout details (password re-entry, 48 h hold) -> customer pays an order ->
// shop statement shows the net -> superadmin approves the payout account -> creates, approves (maker-checker) and pays a batch -> CSV ->
// shop sees the payout. Also asserts gateway keys never appear in any shop-owner page or API response.
// It creates (and removes) its own two superadmin users, so SA_PASSWORD is only the password given to them.
// Usage: BASE=http://localhost:3251 node e2e/payouts.mjs
import { chromium } from "playwright";
import postgres from "postgres";
import bcrypt from "bcryptjs";
import { PDFDocument } from "pdf-lib";
import { mkdtempSync, readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";

const BASE = process.env.BASE ?? "http://localhost:3251";
const SA = process.env.SA_PASSWORD ?? "change-me-now";
const OWNER_PW = "owner12345";
const sql = postgres(process.env.DATABASE_URL ?? "postgres://qp:qp@localhost:5432/quickprint");
const step = (s) => console.log("✔", s);
const assert = (c, m) => { if (!c) throw new Error("ASSERT: " + m); };
const KEY = "sk_test_E2EFAKEKEYabcdefgh9876", HOOK = "whsec_e2efakewebhooksecret5555";
const mod97 = (s) => { let r = 0; for (const ch of s) r = (r * 10 + Number(ch)) % 97; return r; };
const bban = "033" + String(Date.now()).padStart(16, "0").slice(-16);
const IBAN = `AE${String(98 - mod97(bban + "101400")).padStart(2, "0")}${bban}`;
const money = (n) => Number(n).toFixed(2);

const demo = (await sql`select id from tenants where slug='demo'`)[0];
const prevGw = await sql`select * from platform_gateways where provider='stripe'`;
// clean slate for the demo shop's money data (dev database only)
const batches = await sql`select distinct batch_id from payout_items where tenant_id=${demo.id}`;
await sql`delete from payout_items where tenant_id=${demo.id}`;
for (const b of batches) await sql`delete from payout_batches where id=${b.batch_id} and not exists (select 1 from payout_items where batch_id=${b.batch_id})`;
await sql`delete from payout_accounts where tenant_id=${demo.id}`;
await sql`delete from order_settlements where tenant_id=${demo.id}`;
const prevOverride = (await sql`select commission_override o from tenants where id=${demo.id}`)[0].o;
await sql`update tenants set status='active', verification_status='verified', payout_hold_until=null, payout_mode='platform', commission_override=${sql.json({ mode: "custom", pct: 3, perJobFee: 0, minOrderFee: 0, maxOrderFee: null })} where id=${demo.id}`;
await sql`delete from platform_gateways where provider='stripe'`;
// a second superadmin makes the maker-checker rule apply
const makerEmail = `maker-${Date.now()}@quickprint.ae`, checkerEmail = `checker-${Date.now()}@quickprint.ae`;
for (const [e, n] of [[makerEmail, "Maker"], [checkerEmail, "Checker"]]) await sql`insert into users (role, email, password_hash, name) values ('superadmin', ${e}, ${await bcrypt.hash(SA, 8)}, ${n})`;

const OUT = mkdtempSync(path.join(tmpdir(), "payouts-"));
const d = await PDFDocument.create(); for (let i = 0; i < 200; i++) d.addPage([595, 842]); const pdf = path.join(OUT, "doc.pdf"); writeFileSync(pdf, await d.save());
const br = await chromium.launch({ executablePath: process.env.CHROME_PATH || "/opt/pw-browsers/chromium" });
const errors = [];
const page = async (viewport = { width: 1280, height: 900 }) => { const c = await br.newContext({ viewport, acceptDownloads: true }); const p = await c.newPage(); p.on("pageerror", (e) => errors.push(e.message)); return p; };
const login = async (p, email, pw, url) => { await p.goto(`${BASE}/login`); await p.fill('input[name="email"]', email); await p.fill('input[name="password"]', pw); await p.getByRole("button", { name: "Sign in" }).click(); await p.waitForURL(url, { timeout: 60000 }); };

try {
  /* ---- superadmin configures a (fake) gateway ---- */
  const sa = await page();
  await login(sa, makerEmail, SA, /superadmin/);
  await sa.goto(`${BASE}/superadmin/gateways`, { waitUntil: "load" });
  assert(await sa.getByTestId("gateway-stripe").count() === 1 && await sa.locator('[data-testid^="gateway-"]:not([data-testid="gateway-state"]):not([data-testid="gateway-chips"])').count() === 1, "Stripe is the only gateway listed");
  assert((await sa.getByTestId("webhook-url-stripe").innerText()).endsWith("/api/webhooks/stripe"), "webhook URLs shown");
  const card = sa.getByTestId("gateway-stripe");
  await card.locator('input[name="secretKey"]').fill(KEY); await card.locator('input[name="webhookSecret"]').fill(HOOK); await card.locator('input[name="publishableKey"]').fill("pk_test_e2e");
  await card.locator('input[name="payoutHoldDays"]').fill("0");
  await card.locator('input[name="enabled"]').check();
  await card.getByTestId("test-stripe").click();
  await sa.getByTestId("test-result-stripe").filter({ hasText: /Passed/ }).waitFor({ timeout: 20000 });
  await card.getByTestId("save-stripe").click(); await sa.waitForURL(/ok=/, { timeout: 30000 }); await sa.getByText(/Stripe saved/).waitFor();
  const html = await sa.content();
  assert(!html.includes(KEY) && !html.includes(HOOK), "saved secrets are never shown again");
  assert(html.includes("9876"), "only the last 4 characters are shown: ");
  const [gw] = await sql`select api_key_enc, webhook_secret_enc, enabled from platform_gateways where provider='stripe'`;
  assert(gw.enabled && gw.api_key_enc.startsWith("v1:") && !gw.api_key_enc.includes("sk_test"), "stored encrypted");
  const [aud] = await sql`select meta from audit_logs where action='gateway.update' order by created_at desc limit 1`;
  assert(aud && !JSON.stringify(aud.meta).includes("E2EFAKE") && aud.meta.changed.includes("secret key"), "audited without the secret");
  assert((await sa.getByTestId("checklist-stripe").locator('[data-ok="true"]').count()) >= 3, "readiness checklist ticks");
  step("superadmin saves + tests a platform gateway; secrets encrypted, masked, audited");

  /* ---- shop owner: no keys, payout details with password re-entry ---- */
  const owner = await page();
  await login(owner, "owner@demo.ae", OWNER_PW, /admin/);
  const ownerTexts = [];
  const read = async (url) => { await owner.goto(`${BASE}${url}`, { waitUntil: "load" }); const t = await owner.content(); ownerTexts.push(t); return t; };
  await read("/admin/payments");
  assert(await owner.getByText("Payments are handled by QuickPrint").count() === 1, "payments page explains QuickPrint handles payments");
  assert(await owner.locator('input[name="secretKey"], input[name="apiKey"], input[name="webhookSecret"]').count() === 0, "no key fields for shops");
  await owner.goto(`${BASE}/admin/payouts`, { waitUntil: "load" });
  const fill = async (pw, iban) => {
    await owner.fill('input[name="holderName"]', "Demo Print LLC"); await owner.selectOption('select[name="bank"]', "Emirates NBD");
    await owner.fill('input[name="iban"]', iban); await owner.fill('input[name="accountNumber"]', "1234567890"); await owner.fill('input[name="password"]', pw);
    const prev = owner.url(); await owner.getByTestId("save-payout-account").click(); await owner.waitForURL((u) => u.href !== prev && /(ok|error)=/.test(u.href), { timeout: 30000 });
  };
  await fill("wrong-password", IBAN); await owner.getByText(/password was not correct/i).waitFor();
  assert(/password was not correct/i.test(await owner.locator("body").innerText()), "wrong password refused");
  assert((await sql`select count(*)::int n from payout_accounts where tenant_id=${demo.id}`)[0].n === 0, "nothing saved without the right password");
  await fill(OWNER_PW, "AE000000000000000000000"); await owner.getByText(/not valid/i).waitFor();
  assert(/not valid|IBAN/i.test(await owner.locator("body").innerText()), "invalid IBAN refused");
  await fill(OWNER_PW, IBAN);
  await owner.getByTestId("payout-hold").waitFor();
  assert(/48 hours/.test(await owner.locator("body").innerText()), "hold banner explains the 48 h pause");
  const [pa] = await sql`select * from payout_accounts where tenant_id=${demo.id}`;
  assert(pa.status === "pending_review" && pa.iban_last4 === IBAN.slice(-4) && !pa.iban_enc.includes(IBAN) && pa.account_number_enc.startsWith("v1:"), "stored encrypted, pending review");
  const [tn] = await sql`select payout_hold_until h from tenants where id=${demo.id}`;
  const hrs = (new Date(tn.h).getTime() - Date.now()) / 3.6e6; assert(hrs > 47 && hrs < 48.1, "payout_hold_until is ~48h away: " + hrs);
  assert(!(await owner.locator("body").innerText()).includes(IBAN), "the IBAN is never shown again, only the last 4");
  assert((await sql`select count(*)::int n from audit_logs where action='payout.account_saved' and tenant_id=${demo.id}`)[0].n >= 1, "audited");
  step("owner sees no keys; bank details need the password, are encrypted, pending review, 48 h hold + banner");

  /* ---- a customer pays an order ---- */
  const c = await page({ width: 390, height: 844 });
  await c.goto(`${BASE}/s/demo/p/document-printing`); await c.getByTestId("file-input").setInputFiles(pdf); await c.getByText("doc.pdf").waitFor();
  await c.getByTestId("add-to-cart").click(); await c.goto(`${BASE}/s/demo/checkout`);
  await c.fill('input[name="name"]', "Payout Test"); await c.fill('input[name="email"]', "payout@example.com"); await c.fill('input[name="phone"]', "+971501110001");
  await c.getByTestId("mode-pickup").click();
  await c.locator('[data-testid="slots"] button').last().click().catch(() => {});
  { const rc = c.getByTestId("rights-checkbox"); if (await rc.count()) await rc.check(); } await c.getByTestId("place-order").click(); await c.waitForURL(/\/orders\//, { timeout: 30000 });
  await c.reload({ waitUntil: "load" }); await c.getByText(/Paid|Printing/i).first().waitFor({ timeout: 20000 });
  const orderNo = (await c.locator("body").innerText()).match(/[A-Z]{2,4}-\d{4,}/)?.[0];
  const [st] = await sql`select s.* from order_settlements s join orders o on o.id=s.order_id where o.number=${orderNo}`;
  assert(st && st.kind === "sale", "ledger row for " + orderNo);
  const [cm] = await sql`select c.* from order_commissions c join orders o on o.id=c.order_id where o.number=${orderNo}`;
  assert(Number(st.gross) > 0 && Number(st.gateway_fee) > 0, "gross and an estimated gateway fee recorded");
  assert(Math.abs(Number(st.net_amount) - (Number(st.gross) - Number(st.gateway_fee) - Number(st.commission))) < 0.011, "net = gross - fee - commission");
  assert(cm.status === "settled" && Number(st.commission) === Number(cm.fee), "commission netted from the payout, marked settled (not invoiced)");
  step(`order ${orderNo} paid: gross ${st.gross}, fee ${st.gateway_fee}, commission ${st.commission}, net ${st.net_amount}`);

  /* ---- shop statement ---- */
  await read("/admin/payouts");
  const row = owner.getByTestId("statement-row").filter({ hasText: orderNo });
  assert(await row.count() === 1, "statement lists the order");
  assert((await row.getByTestId("row-net").innerText()).replace(/[^\d.]/g, "") === money(st.net_amount).replace(/[^\d.]/g, ""), "statement net matches the ledger");
  assert((await owner.getByTestId("bal-available").innerText()).replace(/[^\d.]/g, "") === money(st.net_amount).replace(/[^\d.]/g, ""), "available balance = net");
  const [dl] = await Promise.all([owner.waitForEvent("download"), owner.getByTestId("statement-csv").click()]);
  const stmtCsv = readFileSync(await dl.path(), "utf8"); assert(stmtCsv.includes(orderNo) && stmtCsv.includes(money(st.net_amount)), "statement CSV has the order and net");
  step("shop statement + CSV match the ledger");

  /* ---- superadmin: review the account, hold blocks the batch, then batch lifecycle ---- */
  await sa.goto(`${BASE}/superadmin/payouts`, { waitUntil: "load" });
  const queue = sa.getByTestId("account-row").filter({ hasText: "Demo Print LLC" });
  assert(await queue.count() === 1, "account waiting in the review queue");
  const qText = await queue.innerText(); assert(!qText.includes(IBAN) && qText.includes(IBAN.slice(-4)), "queue shows a masked IBAN only");
  await queue.getByRole("button", { name: /Reveal full IBAN/ }).click();
  await queue.getByTestId("revealed-iban").waitFor(); assert((await queue.getByTestId("revealed-iban").innerText()).replace(/\s/g, "").includes(IBAN), "audited reveal shows the full IBAN");
  assert((await sql`select count(*)::int n from audit_logs where action='payout.iban_revealed'`)[0].n >= 1, "reveal audited");
  await queue.getByTestId("approve-account").click(); await sa.waitForURL(/ok=/, { timeout: 30000 }); await sa.getByText("Payout account approved.").waitFor();
  await sa.locator('[role="alert"], [role="status"]').first().waitFor();
  const skip = sa.getByTestId("plan-skip").filter({ hasText: "Demo" });
  assert(await skip.count() >= 1 && /48 hours/.test(await skip.first().innerText()), "approved account is still skipped: bank details changed in the last 48 hours");
  step("superadmin approves the payout account; the 48 h hold still keeps the shop out of the batch (reason shown)");
  await sql`update tenants set payout_hold_until = now() - interval '1 minute' where id=${demo.id}`;
  await sa.goto(`${BASE}/superadmin/payouts`, { waitUntil: "load" });
  const line = sa.getByTestId("plan-line").filter({ hasText: "Demo" });
  assert(await line.count() === 1, "after the hold the shop is in the plan");
  await sa.getByTestId("create-batch").click(); await sa.waitForURL(/\/superadmin\/payouts\/[0-9a-f-]{36}/, { timeout: 30000 });
  const num = (await sa.locator("h1").innerText()).match(/PB-\d{6}-\d{4}/)?.[0]; assert(num, "batch number format: " + (await sa.locator("h1").innerText()));
  assert((await sa.getByTestId("batch-status").innerText()) === "draft", "draft");
  assert((await sa.getByTestId("batch-item").filter({ hasText: "Demo" }).innerText()).includes(IBAN.slice(-4)) && !(await sa.content()).includes(IBAN), "batch page masks IBANs");
  // maker-checker: the creator cannot approve
  assert(await sa.getByTestId("approve-batch").isDisabled(), "creator cannot approve (maker-checker)");
  // CSV
  // (the ledger backfill may also have added older paid demo orders: the batch pays everything available)
  const total = money((await sql`select coalesce(sum(net_amount),0) t from order_settlements where tenant_id=${demo.id}`)[0].t);
  assert(money((await sa.getByTestId("batch-total").innerText()).replace(/[^\d.]/g, "")) === total, "batch total = the shop's available ledger: " + total);
  const [csvDl] = await Promise.all([sa.waitForEvent("download"), sa.getByTestId("batch-csv").click()]);
  const csv = readFileSync(await csvDl.path(), "utf8");
  assert(csv.includes(IBAN) && csv.includes("Demo Print LLC") && csv.includes(total), "bank CSV: decrypted IBAN, holder, amount");
  assert((await sql`select count(*)::int n from audit_logs where action='payout.csv_exported'`)[0].n >= 1, "export audited");
  const batchUrl = sa.url().split("?")[0];
  // a different superadmin approves
  const chk = await page(); await login(chk, checkerEmail, SA, /superadmin/);
  await chk.goto(batchUrl, { waitUntil: "load" });
  await chk.getByTestId("approve-batch").click(); await chk.waitForURL(/ok=/, { timeout: 30000 }); await chk.getByText(/Batch approved/).waitFor();
  assert((await chk.getByTestId("batch-status").innerText()) === "approved", "approved by the second superadmin");
  // mark paid
  await chk.getByTestId("bank-reference").fill("E2E-REF-" + Date.now()); await chk.getByTestId("mark-paid").click(); await chk.waitForURL(/ok=/, { timeout: 30000 }); await chk.getByText(/marked as paid/).waitFor();
  assert((await chk.getByTestId("batch-status").innerText()) === "paid", "marked paid");
  assert(await chk.getByTestId("approve-batch").count() === 0 && await chk.getByTestId("mark-paid").count() === 0 && await chk.getByTestId("cancel-batch").count() === 0, "paid batch has no actions left (immutable)");
  const [s2] = await sql`select status from order_settlements where id=${st.id}`; assert(s2.status === "paid", "settlement paid");
  step(`batch ${num}: created, creator blocked, CSV exported, approved by a second superadmin, marked paid, immutable`);

  /* ---- reconciliation panel ---- */
  await sa.goto(`${BASE}/superadmin/payouts`, { waitUntil: "load" });
  assert(await sa.getByTestId("recon-row").count() >= 1, "reconciliation panel lists gateway totals vs ledger");

  /* ---- shop sees the payout; no keys anywhere ---- */
  const hist = await read("/admin/payouts");
  const hr = owner.getByTestId("payout-history-row").filter({ hasText: num });
  assert(await hr.count() === 1 && /Paid/.test(await hr.innerText()) && /E2E-REF-/.test(await hr.innerText()), "payout appears in the shop's history with the bank reference");
  assert((await owner.getByTestId("bal-paid").innerText()).replace(/[^\d.]/g, "") === total.replace(/[^\d.]/g, ""), "paid-out total updated");
  for (const u of ["/admin", "/admin/settings", "/admin/billing", "/admin/orders"]) await read(u);
  const apis = [];
  for (const u of ["/api/v1/admin/payments/test", "/admin/payouts/statement"]) { const r = await owner.request.get(`${BASE}${u}`).catch(() => null); if (r) apis.push(await r.text()); }
  const rp = await owner.request.post(`${BASE}/api/v1/admin/payments/test`, { data: { provider: "stripe" } }); assert(rp.status() === 410, "shop key-test API is retired (410)");
  apis.push(await rp.text());
  const all = [...ownerTexts, ...apis, hist].join("\n");
  for (const secret of [KEY, HOOK, "E2EFAKEKEY", "e2efakewebhooksecret"]) assert(!all.includes(secret), `gateway secret "${secret.slice(0, 8)}…" never appears in shop-owner pages or API responses`);
  const gone = await owner.request.post(`${BASE}/api/webhooks/stripe/${demo.id}`, { data: "{}" }); assert(gone.status() === 410, "per-shop webhook answers 410 Gone");
  const platformHook = await owner.request.post(`${BASE}/api/webhooks/stripe`, { data: "{}", headers: { "stripe-signature": "t=1,v1=bad" } }); assert([400, 503].includes(platformHook.status()), "platform webhook rejects unsigned/forged requests: " + platformHook.status());
  step("shop history shows the payout; gateway keys never reach a shop-owner page or API; old webhook routes 410; forged webhook rejected");

  assert(errors.length === 0, "no page errors: " + errors.join(" | "));
  console.log("\nALL PAYOUT E2E CHECKS PASSED");
} finally {
  await sql`update tenants set commission_override=${prevOverride === null ? null : sql.json(prevOverride)} where id=${demo.id}`;
  await sql`delete from platform_gateways where provider='stripe'`;
  if (prevGw.length) await sql`insert into platform_gateways ${sql(prevGw[0])}`;
  await sql`delete from users where email in (${makerEmail}, ${checkerEmail})`;
  await br.close(); await sql.end();
}
