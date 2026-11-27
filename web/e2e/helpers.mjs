// Shared helpers for the Playwright scripts. Signup is now two steps (details -> card); in test mode (PAYMENTS_FAKE=1) the
// card step has a "Use test card" button. A new shop is unverified: use verifyShop() when a script needs live ordering.
import postgres from "postgres";


// The cookie notice is a fixed overlay that would intercept clicks in every script: pre-dismiss it in each new browser context
// (e2e/compliance.mjs sets KEEP_COOKIE_NOTICE=1 to test the notice itself).
import { chromium as __chromium } from "playwright";
if (!process.env.KEEP_COOKIE_NOTICE) {
  const __launch = __chromium.launch.bind(__chromium);
  __chromium.launch = async (...a) => {
    const b = await __launch(...a);
    const nc = b.newContext.bind(b), np = b.newPage.bind(b);
    b.newContext = async (o) => { const c = await nc(o); await c.addCookies([{ name: "qp_cookie_notice", value: "1", url: process.env.BASE ?? "http://localhost:3200" }]); return c; };
    b.newPage = async (o) => { const c = await b.newContext(o); return c.newPage(); };
    return b;
  };
}

export const BASE = process.env.BASE ?? "http://localhost:3200";
export const SA_PASSWORD = process.env.SA_PASSWORD ?? "change-me-now";
export const sqlClient = () => postgres(process.env.DATABASE_URL ?? "postgres://qp:qp@localhost:5432/quickprint");

/** A UAE mobile number nobody else uses (owner phones are unique platform-wide). */
export const uniquePhone = () => `+9715${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;

/**
 * Sign a new shop up through the UI. Returns { slug, email, password, phone }.
 * opts.card:   true (default) completes the card step with the test card; false stops at the card step (shop stays 'incomplete').
 * opts.ip:     client address to present (default: random). opts.expectError / expectCardError: return without waiting for the next step.
 * opts.cardId: use a named test card (same id twice = same card, to prove the second trial is refused).
 */
export async function signup(page, opts = {}) {
  const base = opts.base ?? BASE;
  const stamp = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const slug = opts.slug ?? `sh${stamp}`.slice(0, 30);
  const email = opts.email ?? `${slug}@example.com`;
  const password = opts.password ?? "pw123456pw";
  const phone = opts.phone ?? uniquePhone();
  // the signup limit is 5 per hour per IP: give every run its own address (opts.ip reuses one, to test the shared-network flag)
  const ip = opts.ip ?? `10.2.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
  await page.context().setExtraHTTPHeaders({ "x-forwarded-for": ip });
  await page.goto(`${base}/signup`, { waitUntil: "networkidle" });
  await page.getByPlaceholder("Al Noor Printing").fill(opts.name ?? `Shop ${slug}`);
  await page.getByPlaceholder("alnoor").fill(slug);
  await page.getByText("✓ Available").waitFor({ timeout: 15000 });
  await page.fill('input[name="ownerName"]', opts.ownerName ?? "Owner");
  await page.fill('input[name="phone"]', phone);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  if (opts.plan) await page.selectOption('select[name="plan"]', opts.plan);
  if (opts.accept !== false) await page.getByTestId("accept-legal").check(); // Terms, Privacy and Seller Agreement
  await page.getByRole("button", { name: /continue to card/i }).click();
  if (opts.expectError) return { slug, email, password, phone };
  await page.getByTestId("card-step").waitFor({ timeout: 60000 });
  if (opts.card === false) return { slug, email, password, phone };
  if (opts.cardId) await page.route("**/api/v1/billing/card/fake", (route) => route.continue({ postData: JSON.stringify({ cardId: opts.cardId }) }));
  await page.getByTestId("use-test-card").click();
  if (opts.expectCardError) return { slug, email, password, phone };
  await page.waitForURL(/\/admin/, { timeout: 60000 });
  return { slug, email, password, phone };
}

/** Skip the review: mark a shop as verified so storefront checkout / directory / SEO treat it as live. */
export async function verifyShop(sql, slug) {
  await sql`update tenants set verification_status='verified' where slug=${slug}`;
}

export async function login(page, email, password, base = BASE) {
  await page.goto(`${base}/login`);
  await page.fill('input[name="email"]', email); await page.fill('input[name="password"]', password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

/**
 * Superadmin sign-in. Superadmins must use two-factor: set SA_TOTP_SECRET (base32) and the code step is filled automatically.
 * If 2FA is not enrolled yet, set SA_ENROL_2FA=1 and the secret is printed once ("SA_TOTP_SECRET=...") after enrolling.
 */
let lastTotp = null;
export async function loginSuperadmin(page, base = BASE) {
  const { totpAt } = await import("../src/server/security/totp.ts");
  await login(page, process.env.SA_EMAIL ?? "admin@quickprint.ae", SA_PASSWORD, base);
  const code = page.getByTestId("totp-code");
  const enrol = process.env.SA_ENROL_2FA === "1";
  await Promise.race([code.waitFor({ timeout: 30000 }).catch(() => {}), page.waitForURL(/superadmin/, { timeout: 30000 }).catch(() => {})]);
  if (await code.isVisible().catch(() => false)) {
    if (!process.env.SA_TOTP_SECRET) throw new Error("this superadmin has 2FA on: set SA_TOTP_SECRET");
    // a code can be used once (replay protection): if the last sign-in used this window's code, wait for the next one
    let c = totpAt(process.env.SA_TOTP_SECRET, Date.now());
    if (c === lastTotp) { await new Promise((r) => setTimeout(r, 30000 - (Date.now() % 30000) + 500)); c = totpAt(process.env.SA_TOTP_SECRET, Date.now()); }
    lastTotp = c;
    await code.fill(c); await page.getByRole("button", { name: "Verify and sign in" }).click();
  }
  await page.waitForURL(/superadmin/, { timeout: 60000 });
  if (enrol && !process.env.SA_TOTP_SECRET) {
    await page.goto(`${base}/superadmin/security`, { waitUntil: "networkidle" });
    await page.getByTestId("start-2fa").click(); await page.getByTestId("totp-secret").waitFor();
    const secret = (await page.getByTestId("totp-secret").innerText()).trim();
    await page.getByTestId("enrol-code").fill(totpAt(secret, Date.now())); await page.getByRole("button", { name: "Turn on two-factor" }).click();
    await page.getByTestId("recovery-codes").waitFor();
    console.log(`SA_TOTP_SECRET=${secret}`);
  }
}

/** Same as signup() but over the API (for scripts that use request contexts): returns the cookie header of the new owner session. */
export async function signupApi(base, body = {}) {
  const stamp = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const slug = body.slug ?? `ap${stamp}`.slice(0, 30);
  const payload = { shopName: `Shop ${slug}`, slug, ownerName: "Owner", email: `${slug}@example.com`, phone: uniquePhone(), password: "pw123456pw", emirate: "Dubai", plan: "growth", acceptLegal: true, ...body };
  const res = await fetch(`${base}/api/v1/signup`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": `10.1.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` }, body: JSON.stringify(payload) });
  const cookie = (res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  if (!res.ok) return { ok: false, status: res.status, body: await res.json().catch(() => ({})), slug, payload };
  const card = await fetch(`${base}/api/v1/billing/card/fake`, { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify(body.cardId ? { cardId: body.cardId } : {}) });
  return { ok: card.ok, status: card.status, cookie, slug, payload, email: payload.email, password: payload.password };
}
