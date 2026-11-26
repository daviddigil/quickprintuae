// Module smoke test: crawls EVERY page as each role and fuzzes EVERY API route. Fails on any 5xx, page crash,
// console/page error or failed same-origin request. Usage: BASE=http://localhost:3200 node e2e/smoke-all.mjs
import { chromium } from "playwright";
import postgres from "postgres";
import { readdirSync, statSync } from "fs";
import path from "path";
import { signup as signupShop } from "./helpers.mjs";

const BASE = process.env.BASE ?? "http://localhost:3200";
const SA_PASS = process.env.SA_PASSWORD ?? "change-me-now";
const sql = postgres(process.env.DATABASE_URL ?? "postgres://qp:qp@localhost:5432/quickprint");
const FAKE = "00000000-0000-4000-8000-000000000000";
const problems = [];
const log = (ok, what, extra = "") => console.log(ok ? "✔" : "✘", what, extra);
const bad = (what, detail) => { problems.push({ what, detail }); };

const walk = (d, f, out = []) => { for (const n of readdirSync(d)) { const p = path.join(d, n); if (statSync(p).isDirectory()) walk(p, f, out); else if (f(p)) out.push(p); } return out; };
const apiRoutes = walk("src/app/api", (p) => p.endsWith("route.ts")).map((p) => "/" + path.relative("src/app", path.dirname(p)).replaceAll(path.sep, "/").replace(/\[[^\]]+\]/g, (m) => (m === "[tenant]" ? "demo" : m === "[provider]" ? "jeebly" : m === "[tenantId]" ? FAKE : FAKE)));

const br = await chromium.launch({ executablePath: process.env.CHROME_PATH || "/opt/pw-browsers/chromium" });

async function ctxWith(login) {
  const ctx = await br.newContext({ viewport: { width: 1280, height: 900 } });
  if (login) {
    const r = await ctx.request.post(BASE + "/api/v1/auth/login", { data: login });
    if (!r.ok()) throw new Error(`login failed ${JSON.stringify({ ...login, password: "***" })}: ${r.status()}`);
    // superadmins sign in with two-factor: SA_TOTP_SECRET supplies the code
    if ((await r.json().catch(() => ({}))).twoFactor) {
      if (!process.env.SA_TOTP_SECRET) throw new Error("superadmin has 2FA on: set SA_TOTP_SECRET");
      const { totpAt } = await import("../src/server/security/totp.ts");
      const r2 = await ctx.request.post(BASE + "/api/v1/auth/2fa", { data: { code: totpAt(process.env.SA_TOTP_SECRET, Date.now()) } });
      if (!r2.ok()) throw new Error(`2fa failed: ${r2.status()}`);
    }
  }
  return ctx;
}

async function crawl(role, ctx, urls) {
  const page = await ctx.newPage();
  let n = 0;
  for (const u of urls) {
    const errs = [];
    const onConsole = (m) => { if (m.type() === "error" && !/favicon|Failed to load resource.*(401|403|404)/i.test(m.text())) errs.push("console: " + m.text().slice(0, 200)); };
    const onPageErr = (e) => errs.push("pageerror: " + e.message.slice(0, 200));
    const onResp = (r) => { if (r.status() >= 500) errs.push(`HTTP ${r.status()} ${r.url().replace(BASE, "")}`); };
    page.on("console", onConsole); page.on("pageerror", onPageErr); page.on("response", onResp);
    let status = 0;
    try {
      const resp = await page.goto(BASE + u, { waitUntil: "networkidle", timeout: 60000 });
      status = resp?.status() ?? 0;
      const text = await page.locator("body").innerText().catch(() => "");
      if (status >= 500) errs.push(`HTTP ${status}`);
      if (/Application error|Internal Server Error|This page couldn.t load|Unhandled Runtime Error|Something went wrong/i.test(text)) errs.push("error text on page: " + text.slice(0, 120).replace(/\n/g, " "));
    } catch (e) { errs.push("navigation: " + e.message.slice(0, 150)); }
    page.off("console", onConsole); page.off("pageerror", onPageErr); page.off("response", onResp);
    n++;
    if (errs.length) { bad(`[${role}] ${u}`, errs.join(" | ")); log(false, `[${role}] ${u}`, `(${status}) ${errs[0]}`); }
  }
  log(!problems.some((p) => p.what.startsWith(`[${role}]`)), `[${role}] crawled ${n} pages`);
  await page.close();
}

async function fuzz(role, ctx) {
  const skip = /\/logout$|^\/api\/cron\/|\/cron\//; // logout kills the session; crons are secret-guarded jobs
  let n = 0;
  for (const r of apiRoutes) {
    if (skip.test(r)) continue;
    for (const [method, body, ct] of [["GET"], ["POST", "{not json", "application/json"], ["POST", "{}", "application/json"], ["PATCH", "{}", "application/json"], ["DELETE"]]) {
      let res;
      try { res = await ctx.request.fetch(BASE + r, { method, data: body, headers: ct ? { "content-type": ct } : {}, timeout: 30000, maxRedirects: 0 }); }
      catch (e) { bad(`[api:${role}] ${method} ${r}`, "request failed: " + e.message.slice(0, 100)); continue; }
      n++;
      const body5 = res.status() >= 500 ? await res.text() : "";
      if (res.status() >= 500 && !/coming soon|Not configured/i.test(body5)) { bad(`[api:${role}] ${method} ${r}`, `HTTP ${res.status()}: ${body5.slice(0, 120)}`); log(false, `[api:${role}] ${method} ${r}`, res.status()); }
    }
  }
  log(!problems.some((p) => p.what.startsWith(`[api:${role}]`)), `[api:${role}] fuzzed ${n} requests`);
}

/* ---------- fixtures ---------- */
const demo = (await sql`select id from tenants where slug='demo'`)[0];
const prods = await sql`select slug, id from products where tenant_id=${demo.id} and active order by sort_order`;
const order = (await sql`select id from orders where tenant_id=${demo.id} order by created_at desc limit 1`)[0];
const wiOrder = (await sql`select id from orders where tenant_id=${demo.id} and source='walk_in' order by created_at desc limit 1`)[0];
const product = (await sql`select id from products where tenant_id=${demo.id} limit 1`)[0];
const tenants = await sql`select id from tenants order by created_at limit 1`;
const { default: crypto } = await import("crypto");
const token = (id) => crypto.createHmac("sha256", process.env.AUTH_SECRET ?? "e2e-auth-secret-0123456789abcdef").update("order:" + id).digest("base64url").slice(0, 32);

const publicPages = ["/", "/pricing", "/signup", "/login", "/s/demo", "/s/demo/cart", "/s/demo/checkout", "/s/demo/account", "/s/demo/walk-in", ...prods.map((p) => `/s/demo/p/${p.slug}`), "/s/nonexistent-shop", "/s/demo/p/nope"];
if (order) publicPages.push(`/s/demo/orders/${order.id}?t=${token(order.id)}`);
if (wiOrder) publicPages.push(`/s/demo/walk-in/status/${wiOrder.id}?t=${token(wiOrder.id)}`);
const adminPages = ["/admin", "/admin/verification", "/admin/orders", "/admin/products", "/admin/fulfillment", "/admin/payments", "/admin/banners", "/admin/whatsapp", "/admin/walk-in", "/admin/walk-in/poster", "/admin/settings", "/admin/customers", "/admin/staff", "/admin/billing", "/admin/orders?status=paid", "/admin/orders?source=walk_in", "/admin/customers?q=a", product && `/admin/products/${product.id}`, order && `/admin/orders/${order.id}`, order && `/admin/orders/${order.id}/invoice`, order && `/admin/orders/${order.id}/invoice?ticket=1`].filter(Boolean);
const saPages = ["/superadmin", "/superadmin/verifications", "/superadmin/tenants", "/superadmin/plans", "/superadmin/invoices", "/superadmin/commissions", "/superadmin/usage", "/superadmin/audit", "/superadmin/settings", ...tenants.map((t) => `/superadmin/tenants/${t.id}`)];

/* ---------- 0. SELF-SERVE (first: signup is rate-limited per IP and the API fuzz below also posts to it): brand-new shop signs up through the UI, then everything is crawled for that fresh tenant ---------- */
const stamp = Date.now().toString(36);
const slug = `smoke${stamp}`;
const fresh = await br.newContext({ viewport: { width: 1280, height: 900 } });
const sp = await fresh.newPage(); const spErrs = []; sp.on("pageerror", (e) => spErrs.push(e.message));
let signedUp = null;
try { signedUp = await signupShop(sp, { base: BASE, slug, name: `Smoke Shop ${stamp}`, email: `smoke-${stamp}@example.com`, password: "smoke-pass-123", ownerName: "Smoke Owner" }); } catch (e) { spErrs.push(String(e)); }
try {
  if (!signedUp) throw new Error("signup failed");
  log(true, `[self-serve] signup (details + test card) → /admin for new shop ${slug}`);
} catch { bad("[self-serve] signup", `did not reach /admin; url=${sp.url()} errs=${spErrs.join(";")}`); log(false, "[self-serve] signup", sp.url()); }
if (/\/admin/.test(sp.url())) {
  const newT = (await sql`select id from tenants where slug=${slug}`)[0];
  await crawl("new-shop-owner", fresh, adminPages.filter((u) => !/\/orders\/|\/products\/[0-9a-f]/.test(u)).concat(`/admin/products/${(await sql`select id from products where tenant_id=${newT.id} limit 1`)[0].id}`));
  const pub = await ctxWith();
  await crawl("new-shop-storefront", pub, [`/s/${slug}`, `/s/${slug}/cart`, `/s/${slug}/checkout`, `/s/${slug}/walk-in`, `/s/${slug}/account`, ...(await sql`select slug from products where tenant_id=${newT.id} and active`).map((p) => `/s/${slug}/p/${p.slug}`)]);
  // legacy tenant: strip newer settings keys like an old DB row would have
  await sql`update tenants set settings = settings - 'walkIn' - 'aiDesignerEnabled' - 'heroTitle' - 'heroSubtitle', plan_id = null where id=${newT.id}`;
  await crawl("legacy-tenant-owner", fresh, ["/admin", "/admin/walk-in", "/admin/banners", "/admin/billing", "/admin/settings", "/admin/orders"]);
  await crawl("legacy-tenant-store", pub, [`/s/${slug}`, `/s/${slug}/walk-in`, `/s/${slug}/p/business-cards`]);
  await sql`delete from tenants where id=${newT.id}`;
}

/* ---------- 1. anonymous ---------- */
const anon = await ctxWith();
await crawl("anon", anon, [...publicPages, "/admin", "/superadmin", "/admin/orders"]); // protected pages must redirect to /login, not crash
await fuzz("anon", anon);

/* ---------- 2. customer ---------- */
const cust = await ctxWith({ email: "customer@demo.ae", password: "customer123", store: "demo" });
await crawl("customer", cust, ["/s/demo", "/s/demo/account", "/s/demo/checkout", "/s/demo/walk-in"]);

/* ---------- 3. demo shop owner ---------- */
const owner = await ctxWith({ email: "owner@demo.ae", password: "owner12345" });
await crawl("owner", owner, [...adminPages, ...publicPages.slice(0, 4)]);
await fuzz("owner", owner);

/* ---------- 4. superadmin ---------- */
const sa = await ctxWith({ email: "admin@quickprint.ae", password: SA_PASS });
await crawl("superadmin", sa, saPages);
await fuzz("superadmin", sa);

await br.close(); await sql.end();
console.log(`\n${problems.length ? "✘ " + problems.length + " PROBLEM(S)" : "ALL MODULES CLEAN"}`);
for (const p of problems) console.log(" -", p.what, "→", p.detail);
process.exit(problems.length ? 1 : 0);
