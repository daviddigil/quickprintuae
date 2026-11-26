# Security: threat model, controls, known gaps

Scope: the QuickPrint UAE platform once it holds customer money for shops (platform-held gateway keys, ledger, payouts).
This is an engineering document, not a certification. Re-read it before every go-live gate (see `docs/GO_LIVE.md`).

## 1. What we protect (ranked)

| Asset | Why it matters |
|---|---|
| Platform gateway keys (`platform_gateways`) | Anyone holding them can refund, move or redirect money |
| Payout accounts (IBANs) and the payout approval action | The cheapest fraud is "change the bank account, approve the batch" |
| Superadmin account | Can approve payouts, change gateways, impersonate shops, read confidential files |
| `ENCRYPTION_KEY` and `AUTH_SECRET` | Decrypt all stored secrets and confidential files / forge sessions |
| Customer files and personal data (UAE PDPL) | Confidential print files, names, phones, addresses |
| Ledger integrity (`order_settlements`, `payout_*`) | Wrong numbers become wrong bank transfers |

## 2. Threats on the money flow and the controls

| # | Threat | Controls in place | Residual risk / owner |
|---|---|---|---|
| 1 | Stolen or phished superadmin password | TOTP 2FA mandatory for superadmin in production (`REQUIRE_SUPERADMIN_2FA`), hashed one-time recovery codes, 5 failures lock 15 min, per-IP and per-account throttles, generic errors, audit of lockouts and 2FA changes | Phishable (TOTP is not phishing-proof); consider WebAuthn later |
| 2 | Attacker with a hijacked session approves a payout or edits gateway keys | Step-up (`requireStepUp`): fresh TOTP (or password if no 2FA) within 10 minutes, bound to the session token, impersonation sessions can never step up, attempts rate limited | Agent A must call it on every sensitive action (checklist below) |
| 3 | Shop owner changes IBAN to steal payouts | Password re-entry, 48 h payout block, status back to `pending_review`, audit (payouts module) | Superadmin must compare the new IBAN with the licence holder |
| 4 | Forged payment webhooks | Signature verification per gateway, idempotent processing, order found by provider reference (payments module) | Replay window depends on gateway timestamp tolerance |
| 5 | Credential stuffing against shops | Per-account lockout, per-IP and per-account rate limits (Redis in multi-instance), bcrypt cost 10 | No breached-password check, no CAPTCHA |
| 6 | Account takeover by password reset | Reset token = 32 random bytes, only SHA-256 stored, 60 min, single use (atomic claim), rate limited, same reply for unknown emails, reset invalidates all sessions, 2FA is NOT bypassed by a reset | Email account compromise = reset compromise; superadmin recovery needs a recovery code or DB access (see RUNBOOKS) |
| 7 | Session theft | `qp_session` JWT: httpOnly, `secure` in production, `sameSite=lax`, 30 days (2 h when impersonating), re-validated against the user row (deactivated users, password version) on every request | 30-day lifetime is long; consider sliding 7 days for shop staff |
| 8 | CSRF | Server actions: Next.js built-in Origin/Host check. JSON APIs: cookies are `sameSite=lax`, state changing routes are POST/PUT/DELETE. Review in section 5 | Lax allows top-level GET navigations: no state-changing GET may exist (reviewed) |
| 9 | XSS stealing sessions or injecting a payment page | httpOnly cookie, React escaping, CSP (report-only first, enforce with `CSP_ENFORCE=1` at build), frame-ancestors none, `object-src none` | CSP still allows `unsafe-inline` scripts (see gaps) |
| 10 | Leaked secrets in logs/repo | Gateway keys only in DB (AES-256-GCM), emails never log bodies in production, health endpoint returns booleans only | Rotate with `scripts/reencrypt.ts` and `docs/RUNBOOKS.md` |
| 11 | Insider / support abuse | Audit log (actor, impersonator, IP), IBAN reveal audited, impersonation capped at 2 h | Audit log is in the same DB; ship it to external log storage |
| 12 | Data loss | See `docs/GO_LIVE.md` (PITR, restore drill) | Not verified until a restore drill is done |

## 3. Controls inventory (where to look)

- Passwords: bcrypt (cost 10). Session payload carries `pv` (hash of the password hash) so any password change kills old sessions (`src/lib/auth.ts`).
- 2FA: `src/server/security/totp.ts` (RFC 6238, tested against the RFC vectors), `twofactor.ts`, enrolment UI `/superadmin/security` and the shop owner card in `/admin/settings`. The TOTP secret is encrypted with `src/lib/crypto.ts`.
- Step-up: `src/server/security/stepup.ts` (see section 4).
- Lockout and throttles: `src/server/security/lockout.ts`, `src/app/api/v1/auth/login`, `/2fa`.
- Rate limit store: `src/server/billing/rate-limit.ts` (memory, `REDIS_URL`, or Upstash REST).
- Email: `src/server/email` (Resend, console). Reset tokens never appear in logs in production.
- Storage: `src/server/storage.ts`, confidential files AES-256-GCM before they reach disk or the bucket.
- Headers: `next.config.ts`.

## 4. Step-up API (for money screens)

```ts
import { requireStepUp, isSteppedUp, stepUpMethod, StepUpRequiredError } from "@/server/security/stepup";
await requireStepUp({ next: "/superadmin/payouts" });            // redirects to /login/step-up if no fresh grant (default)
await requireStepUp({ mode: "throw" });                            // throws StepUpRequiredError { code: "STEP_UP_REQUIRED", method }
// client: <StepUpPrompt method="totp" onVerified={retry} />      (src/components/security/StepUpPrompt.tsx)
```

Must be called (first line, before any write) in: gateway key save and test, IBAN reveal, payout batch approve and export, disabling 2FA, regenerating recovery codes (done), changing a shop's commission override, impersonation start (recommended).
Stage a regression test for each: unauthenticated step-up must redirect.

## 5. CSRF review (findings)

- Server actions (`"use server"`): protected by Next.js Origin vs Host comparison. Do not put the platform behind a proxy that rewrites `Host` without forwarding `X-Forwarded-Host`, or actions will fail closed.
- `POST /api/v1/auth/login`, `/2fa`, signup, checkout, walk-in: JSON `fetch` with `content-type: application/json`, cookies `sameSite=lax` (cross-site POST does not carry them). Unauthenticated endpoints are rate limited.
- State changing GET routes found: `/logout` (logs out; low impact, classic "logout CSRF"; left as GET because it is a plain link, protected by lax cookies only for top-level navigation; consider POST), `/api/v1/superadmin/impersonate/stop` (ends impersonation, harmless), cron endpoints `GET /api/v1/superadmin/cron/billing?secret=` and `/api/cron/*` (secret protected, idempotent; prefer an `Authorization` header over the query string so the secret stays out of access logs). No GET route creates, edits or deletes business data or moves money.
- `/api/v1/test/outbox` only exists when `EMAIL_TEST_OUTBOX=1`. NEVER set it in production.

## 6. Headers

`next.config.ts` sends on every route: CSP (report-only unless `CSP_ENFORCE=1` **at build time**), HSTS (production), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, `X-Frame-Options: DENY` (+ `frame-ancestors 'none'`), COOP `same-origin-allow-popups`, no `X-Powered-By`. Allowed third parties: Stripe (js, api, hooks, m.stripe.network), Meta (connect.facebook.net, graph, facebook.com) for WhatsApp embedded signup, Google Fonts for the card designer. Storefronts cannot be framed; if an owner "preview in iframe" is ever added, serve that one route with `frame-ancestors 'self'`.
Rollout: run report-only for a week, watch the browser console on checkout (Stripe Elements, 3-D Secure frame), then set `CSP_ENFORCE=1` and rebuild.

## 7. Dependency audit (`npm audit --omit=dev`)

Last run: 2 findings (1 high, 1 moderate), both `postcss <= 8.5.22` vendored inside `next` (CSS stringify / sourcemap issues). They affect build-time CSS processing of attacker-controlled CSS, which this app does not do (all CSS is ours, built in CI). The only "fix" offered is `next@16` (breaking), so it is **accepted and tracked**: upgrade Next when 16.x has been through a pilot. Re-run the audit in CI weekly and before every release.

## 8. Known gaps (be honest before real money)

1. CSP uses `'unsafe-inline'` for scripts (no per-request nonce). Moving to nonces needs middleware plus dynamic rendering of all pages.
2. No WebAuthn / passkeys; TOTP can be phished by a real-time proxy.
3. No CAPTCHA or bot protection on signup and login (Cloudflare Turnstile is the cheap fix).
4. TOTP codes can be replayed inside their 30 s window (no last-used-step store). Throttles make this low risk.
5. Maker-checker for payout batches only when two superadmins exist (payouts module); a single superadmin approves alone with step-up.
6. Audit log lives in the application database; an attacker with DB write access can edit it. Ship to append-only external storage.
7. No automated pen test yet. Book one before live payouts (`docs/GO_LIVE.md` gate 3).
8. Sessions are stateless JWTs: "log out everywhere" is only possible via password change (by design, `pv`).
9. Rate limits are per instance until `REDIS_URL` or Upstash is configured. Mandatory for more than one instance.
10. Error tracking is not wired (document-only Sentry plan in `docs/GO_LIVE.md`).
11. `getSession()` (used by a handful of API routes) does not re-check the password version; `getCurrentUser()` does. Prefer `getCurrentUser()` for anything sensitive.
