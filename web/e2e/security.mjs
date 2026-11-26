// Security end to end: security headers, superadmin 2FA enrolment + login challenge, step-up guard, lockout after 5 failures,
// password reset by email (console provider outbox) incl. single use and session invalidation, no account enumeration.
// Needs a server (BASE) started with: PAYMENTS_FAKE=1 EMAIL_PROVIDER=console EMAIL_TEST_OUTBOX=1 REQUIRE_SUPERADMIN_2FA=0 APP_URL=$BASE
// Usage: BASE=http://localhost:3253 node --import tsx e2e/security.mjs     (uses throwaway users; the real admin login is never touched)
import { chromium } from "playwright";
import postgres from "postgres";
import bcrypt from "bcryptjs";
import { totpAt } from "../src/server/security/totp.ts";

const BASE = process.env.BASE ?? "http://localhost:3253";
const sql = postgres(process.env.DATABASE_URL ?? "postgres://qp:qp@localhost:5432/quickprint");
const step = (s) => console.log("✔", s);
const assert = (c, m) => { if (!c) throw new Error("ASSERT: " + m); };
const stamp = Date.now().toString(36); // unique per run: login throttles are per account and live in server memory
const SA = `sec-${stamp}-admin@quickprint.ae`, ST = `sec-${stamp}-owner@demo.ae`;
const PW = "Sup3r-secret-pass", NEWPW = "Brand-new-pass-99";
const hash = await bcrypt.hash(PW, 10);
const demo = (await sql`select id from tenants where slug='demo'`)[0];

async function cleanup() {
  await sql`delete from users where email in (${SA}, ${ST})`;
  await sql`delete from audit_logs where meta->>'email' in (${SA}, ${ST})`;
}
await cleanup();
await sql`insert into users (tenant_id, role, email, password_hash, name) values (null, 'superadmin', ${SA}, ${hash}, 'Sec E2E Admin')`;
await sql`insert into users (tenant_id, role, email, password_hash, name) values (${demo.id}, 'owner', ${ST}, ${hash}, 'Sec E2E Owner')`;

const br = await chromium.launch({ executablePath: process.env.CHROME_PATH || "/opt/pw-browsers/chromium" });
const errors = [];
const newPage = async () => { const c = await br.newContext({ viewport: { width: 1280, height: 900 } }); const p = await c.newPage(); p.on("pageerror", (e) => errors.push(e.message)); return p; };
const signIn = async (p, email, password) => {
  await go(p, `${BASE}/login`);
  await p.fill('input[name="email"]', email); await p.fill('input[name="password"]', password);
  await p.getByRole("button", { name: "Sign in" }).click();
};
const go = async (p, u) => { await p.goto(u, { waitUntil: "load" }); await p.waitForTimeout(1200); }; // not "networkidle": nav prefetches keep it busy
const code = (secret, offset = 0) => totpAt(secret, Date.now() + offset);

try {
  /* ---- headers ---- */
  for (const path of ["/", "/login", "/api/health", "/s/demo", "/superadmin"]) {
    const r = await fetch(BASE + path, { redirect: "manual" });
    const h = r.headers;
    const csp = h.get("content-security-policy") ?? h.get("content-security-policy-report-only") ?? "";
    assert(csp.includes("js.stripe.com") && csp.includes("api.stripe.com") && csp.includes("hooks.stripe.com") && csp.includes("connect.facebook.net") && csp.includes("frame-ancestors 'none'") && csp.includes("object-src 'none'"), `CSP on ${path}`);
    assert(h.get("x-content-type-options") === "nosniff", `nosniff on ${path}`);
    assert(h.get("x-frame-options") === "DENY", `x-frame-options on ${path}`);
    assert(h.get("referrer-policy") === "strict-origin-when-cross-origin", `referrer-policy on ${path}`);
    assert(/camera=\(\)/.test(h.get("permissions-policy") ?? ""), `permissions-policy on ${path}`);
    assert(!h.get("x-powered-by"), `no x-powered-by on ${path}`);
    if (process.env.EXPECT_HSTS !== "0") assert((h.get("strict-transport-security") ?? "").includes("max-age=31536000"), `HSTS on ${path}`);
  }
  step("security headers (CSP incl. Stripe/Meta, nosniff, frame deny, referrer, permissions, HSTS) on key routes");

  const health = await (await fetch(`${BASE}/api/health`)).json();
  assert(health.ok === true && typeof health.dbLatencyMs === "number" && health.version && health.gateways && typeof health.gateways.liveReady === "boolean", "health shape");
  assert(!/postgres:|secret|password|sk_/i.test(JSON.stringify(health)), "health leaks nothing");
  step(`/api/health: db ${health.dbLatencyMs}ms, version ${health.version}, migrations ${health.migrationsApplied}/${health.migrationsShipped ?? "?"}, gateways liveReady=${health.gateways.liveReady}`);
  assert((await fetch(`${BASE}/api/v1/test/outbox`)).status === 200, "test outbox enabled for this run");

  /* ---- superadmin enrols 2FA ---- */
  const sa = await newPage();
  await signIn(sa, SA, PW); await sa.waitForURL(/\/superadmin/, { timeout: 60000 });
  await go(sa, `${BASE}/superadmin/security`);
  await sa.getByTestId("start-2fa").click();
  await sa.getByTestId("totp-secret").waitFor();
  const secret = (await sa.getByTestId("totp-secret").innerText()).trim();
  assert(/^[A-Z2-7]{32}$/.test(secret), "secret shown");
  await sa.getByTestId("enrol-code").fill("000000"); await sa.getByRole("button", { name: "Turn on two-factor" }).click();
  await sa.getByText("That code is not right").waitFor();
  step("wrong first code is rejected");
  await sa.getByTestId("enrol-code").fill(code(secret)); await sa.getByRole("button", { name: "Turn on two-factor" }).click();
  await sa.getByTestId("recovery-codes").waitFor();
  const codes = (await sa.getByTestId("recovery-codes").locator("li").allInnerTexts()).map((s) => s.trim());
  assert(codes.length === 10 && codes.every((c) => /^[A-Z2-9]{5}-[A-Z2-9]{5}$/.test(c)), "10 recovery codes shown once");
  const row = (await sql`select totp_secret_enc, totp_enabled_at, recovery_codes_hash from users where email=${SA}`)[0];
  assert(row.totp_enabled_at && row.totp_secret_enc.startsWith("v1:") && !row.totp_secret_enc.includes(secret), "secret stored encrypted");
  assert(row.recovery_codes_hash.length === 10 && !JSON.stringify(row.recovery_codes_hash).includes(codes[0]), "recovery codes stored hashed");
  step("superadmin enrolled: QR secret verified, 10 recovery codes shown once, stored hashed, secret encrypted");

  /* ---- step-up guards a sensitive action ---- */
  await go(sa, `${BASE}/superadmin/security`);
  await sa.getByRole("button", { name: "Generate new recovery codes" }).click();
  await sa.waitForURL(/\/login\/step-up\?next=/, { timeout: 30000 });
  await sa.fill('input[name="credential"]', "123456"); await sa.getByRole("button", { name: "Verify" }).click();
  await sa.getByText("That code is not valid").waitFor();
  await sa.fill('input[name="credential"]', code(secret)); await sa.getByRole("button", { name: "Verify" }).click();
  await sa.waitForURL(/\/superadmin\/security/, { timeout: 30000 });
  await sa.getByRole("button", { name: "Generate new recovery codes" }).click();
  await sa.getByTestId("recovery-codes").waitFor();
  const codes2 = (await sa.getByTestId("recovery-codes").locator("li").allInnerTexts()).map((s) => s.trim());
  assert(codes2.length === 10 && codes2[0] !== codes[0], "new recovery codes after step-up");
  step("step-up: sensitive action redirects to the prompt, wrong code refused, right code lets it through for 10 minutes");

  /* ---- logout + login with challenge ---- */
  await sa.goto(`${BASE}/logout?next=/login`);
  await signIn(sa, SA, PW);
  await sa.getByTestId("totp-code").waitFor();
  assert(!(await sa.url()).includes("superadmin"), "no session before the code");
  assert((await sa.context().cookies()).every((c) => c.name !== "qp_session"), "no session cookie before the second factor");
  await sa.getByTestId("totp-code").fill("111111"); await sa.getByRole("button", { name: "Verify and sign in" }).click();
  await sa.getByText(/Invalid code/).waitFor();
  await sa.getByTestId("totp-code").fill(code(secret)); await sa.getByRole("button", { name: "Verify and sign in" }).click();
  await sa.waitForURL(/\/superadmin/, { timeout: 60000 });
  step("login after password asks for the authenticator code; wrong code refused; right code signs in");
  // recovery code works once
  await sa.goto(`${BASE}/logout?next=/login`); await signIn(sa, SA, PW);
  await sa.getByTestId("totp-code").fill(codes2[0]); await sa.getByRole("button", { name: "Verify and sign in" }).click();
  await sa.waitForURL(/\/superadmin/, { timeout: 60000 });
  await sa.goto(`${BASE}/logout?next=/login`); await signIn(sa, SA, PW);
  await sa.getByTestId("totp-code").fill(codes2[0]); await sa.getByRole("button", { name: "Verify and sign in" }).click();
  await sa.getByText(/Invalid code/).waitFor();
  step("recovery code signs in once and cannot be reused");
  const audits = await sql`select action from audit_logs where meta->>'userId' = (select id::text from users where email=${SA}) or action like 'security.%'`;
  assert(audits.some((a) => a.action === "security.2fa_enabled") && audits.some((a) => a.action === "security.recovery_code_used"), "2FA changes audited");

  /* ---- lockout after 5 failures (owner throwaway) ---- */
  const ow = await newPage();
  const attempt = async (pw) => { await signIn(ow, ST, pw); await ow.waitForTimeout(250); };
  for (let i = 0; i < 5; i++) { await attempt("wrong-password-" + i); await ow.getByText(/Invalid email or password/).first().waitFor(); }
  const locked = (await sql`select failed_logins, locked_until from users where email=${ST}`)[0];
  assert(locked.failed_logins >= 5 && locked.locked_until && locked.locked_until.getTime() > Date.now() + 14 * 60_000, "locked for ~15 minutes");
  await attempt(PW); // correct password while locked
  await ow.getByText(/Invalid email or password/).first().waitFor();
  assert(!(await ow.context().cookies()).some((c) => c.name === "qp_session"), "correct password refused during lockout");
  const msgLocked = await ow.getByText(/Invalid email or password/).first().innerText();
  await signIn(ow, "nobody-here@demo.ae", PW); await ow.getByText(/Invalid email or password/).first().waitFor();
  assert((await ow.getByText(/Invalid email or password/).first().innerText()) === msgLocked, "same message for locked, wrong password and unknown account");
  assert((await sql`select 1 from audit_logs where action='security.account_locked' and meta->>'email'=${ST}`).length === 1, "lockout audited");
  step("5 wrong passwords lock the account for 15 min (correct password refused), generic identical error, lockout audited");
  await sql`update users set failed_logins=0, locked_until=null where email=${ST}`;

  /* ---- password reset ---- */
  await signIn(ow, ST, PW); await ow.waitForURL(/\/admin/, { timeout: 60000 }); // an existing session
  const other = await newPage();
  await go(other, `${BASE}/forgot-password`);
  await other.fill('input[name="email"]', "does-not-exist@nowhere.ae"); await other.getByRole("button", { name: "Send reset link" }).click();
  const ghostText = await other.getByTestId("forgot-done").innerText();
  assert((await (await fetch(`${BASE}/api/v1/test/outbox?to=does-not-exist@nowhere.ae`)).json()).messages.length === 0, "no email for unknown account");
  await go(other, `${BASE}/forgot-password`);
  await other.fill('input[name="email"]', ST); await other.getByRole("button", { name: "Send reset link" }).click();
  assert((await other.getByTestId("forgot-done").innerText()) === ghostText, "same response for real and unknown accounts (no enumeration)");
  const mail = (await (await fetch(`${BASE}/api/v1/test/outbox?to=${ST}`)).json()).messages[0];
  assert(mail && /Reset your QuickPrint password/.test(mail.subject), "reset email sent");
  const link = mail.text.match(/https?:\/\/\S+\/reset-password\/([A-Za-z0-9_-]{43})/);
  assert(link, "link in email");
  const tokenRow = (await sql`select token_hash, expires_at from password_resets where user_id=(select id from users where email=${ST})`)[0];
  assert(tokenRow.token_hash.length === 64 && !tokenRow.token_hash.includes(link[1]), "only the hash is stored");
  assert(Math.abs(tokenRow.expires_at.getTime() - (Date.now() + 3600_000)) < 120_000, "expires in 60 minutes");
  await go(other, `${BASE}/reset-password/${link[1]}`);
  await other.fill('input[name="password"]', "short"); await other.fill('input[name="confirm"]', "short");
  assert((await other.locator('input[name="password"]').getAttribute("minlength")) === "10", "client min length");
  await other.fill('input[name="password"]', NEWPW); await other.fill('input[name="confirm"]', NEWPW);
  await other.getByRole("button", { name: "Change password" }).click();
  await other.getByTestId("reset-done").waitFor();
  step("password reset by email: same reply for unknown accounts, hash-only 60-min token, new password set");
  await go(other, `${BASE}/reset-password/${link[1]}`);
  await other.getByText("This link is invalid or has expired").waitFor();
  step("reset link is single use");
  await go(ow, `${BASE}/admin`);
  assert(ow.url().includes("/login"), "old session invalidated by password change");
  step("existing session is invalidated when the password changes");
  await signIn(ow, ST, PW); await ow.getByText(/Invalid email or password/).first().waitFor();
  await signIn(ow, ST, NEWPW); await ow.waitForURL(/\/admin/, { timeout: 60000 });
  step("old password refused, new password works");

  /* ---- password step-up for an account without 2FA ---- */
  await go(ow, `${BASE}/login/step-up?next=/admin/settings`);
  await ow.fill('input[name="credential"]', "nope"); await ow.getByRole("button", { name: "Verify" }).click();
  await ow.getByText("That password is not correct").waitFor();
  await ow.fill('input[name="credential"]', NEWPW); await ow.getByRole("button", { name: "Verify" }).click();
  await ow.waitForURL(/\/admin\/settings/, { timeout: 30000 });
  await ow.getByTestId("two-factor-panel").waitFor({ timeout: 15000 });
  step("password step-up for accounts without 2FA; shop owner settings show the 2FA section");

  assert(errors.length === 0, "no page errors: " + errors.join(" | "));
  console.log("\nSECURITY E2E PASSED");
} finally {
  await cleanup();
  await br.close(); await sql.end();
}
