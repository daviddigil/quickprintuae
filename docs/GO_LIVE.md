# Go-live plan (phased checklist)

Status values: `todo`, `doing`, `blocked`, `done`. Owners are roles; replace with names. Update this file weekly.
Related: `docs/SECURITY.md`, `docs/RUNBOOKS.md`, `docs/LEGAL_CHECKLIST.md`, `docs/ROADMAP.md`.

## Phase 0: gates that can block everything (start now)

| # | Item | Owner | Status | Notes |
|---|---|---|---|---|
| 0.1 | **Legal advice: does holding customer funds for sellers and paying them out need a licensed payment facilitator / acquirer arrangement in the UAE?** | Founder + lawyer | todo | **Get legal advice. Do not assume either answer.** Decides whether we go through a gateway marketplace programme (Mamo recipients / Stripe Connect equivalent) or need our own licence. Longest lead time. See `docs/LEGAL_CHECKLIST.md` |
| 0.2 | Gateway approvals: Stripe account live mode, Mamo business + marketplace/recipients approval | Founder | todo | Mamo docs still owed by the owner (recurring + recipients) |
| 0.3 | Operating entity, trade licence, bank account(s), decision on client-funds account | Founder + accountant | todo | |
| 0.4 | Accountant answers on VAT, who issues the customer tax invoice, e-invoicing readiness | Accountant | todo | Questions in `docs/LEGAL_CHECKLIST.md` section C |

## Phase 1: legal and compliance documents

| # | Item | Owner | Status |
|---|---|---|---|
| 1.1 | Seller agreement (payout terms, holds, chargebacks, prohibited items) | Lawyer | todo |
| 1.2 | Customer terms of sale, refund policy (personalised goods rule) | Lawyer | todo |
| 1.3 | Privacy policy aligned to UAE PDPL, processor list, retention, data subject requests route | Lawyer | todo |
| 1.4 | KYC/AML policy for sellers; seller verification queue SLA (target 2 working days) | Compliance | todo |
| 1.5 | Data export / delete tooling for PDPL requests (admin script or screen) | Engineering | todo |
| 1.6 | Publish legal pages on the site and link from signup and checkout | Engineering | todo |

## Phase 2: infrastructure

| # | Item | Owner | Status | Notes |
|---|---|---|---|---|
| 2.1 | Managed Postgres 14+ with daily backups **and point-in-time recovery**, in a UAE/nearby region | Ops | todo | See hosting comparison below |
| 2.2 | **Restore drill**: restore last night's backup AND a PITR to a timestamp into a scratch instance, run `npm run db:migrate`, `/api/health` must be green, ledger totals must match. Record the time it took. Repeat quarterly | Ops | todo | Procedure in `docs/RUNBOOKS.md` (DB restore) |
| 2.3 | Object storage (S3-compatible) with versioning off for `.enc` files, private bucket, lifecycle rule, `STORAGE_DRIVER=s3` | Ops | todo | `src/server/storage.ts`, confidential files stay AES-GCM encrypted by the app |
| 2.4 | Secrets: a secrets manager or the host's encrypted env store; never in git or the image. `AUTH_SECRET`, `ENCRYPTION_KEY` (32+ random chars), `CRON_SECRET`, DB URL, gateway keys (in DB) | Ops | todo | Back up `ENCRYPTION_KEY` in two separate secure places: losing it loses every stored secret |
| 2.5 | Domain, DNS, wildcard `*.ROOT_DOMAIN` TLS cert (DNS-01), custom-domain flow (CNAME + on-demand TLS; see README Caddy example) | Ops | todo | |
| 2.6 | CDN in front (Cloudflare or similar): cache `/_next/static`, product images; WAF and bot rules on `/api/v1/auth/*` and signup | Ops | todo | CDN must forward `X-Forwarded-For` (rate limits and audit use it) |
| 2.7 | Redis (managed) or Upstash for rate limits: `REDIS_URL` or `UPSTASH_REDIS_REST_*`. **Required if more than one app instance** | Ops | todo | |
| 2.8 | Deploy + migration safety: images are immutable; `docker/entrypoint.sh` runs `migrate.js` then the idempotent seed before the server starts. Rules: (a) migrations must be backward compatible with the previous app version (add columns nullable, drop later); (b) take a DB snapshot before each release; (c) never run two entrypoints migrating at the same time (run migrate as a one-off job when scaling above one instance, then `RUN_MIGRATIONS=false` on app containers); (d) keep the previous image tag for rollback; (e) `ALTER TYPE ... ADD VALUE` migrations cannot be rolled back, so roll forward | Engineering | todo | |
| 2.9 | Docker `HEALTHCHECK` should call `/api/health` (currently `/`). `CSP_ENFORCE` is read at **build** time: pass it as a build arg | Engineering | todo | |
| 2.10 | Staging environment mirroring production (test gateways, `PAYMENTS_FAKE=0`) | Ops | todo | |

### Hosting options compared (honest)

| Option | Good | Bad | Fit |
|---|---|---|---|
| Hostinger Business/Cloud (Node.js hosting) | Cheap, simple panel, easy domain | Managed Node apps are shared infrastructure; no managed Postgres (MySQL only on shared plans, so you would need an external Postgres); no wildcard TLS and custom-domain automation; no Docker; no PITR. Weak for a money platform | Marketing site only, **not** this app |
| Hostinger VPS (KVM) + Docker | Full control, cheap, can run `docker compose` and Caddy for wildcard TLS | You own patching, firewall, backups, Postgres tuning, monitoring; single machine = single point of failure; PITR is DIY (pgBackRest/WAL-G) | Pilot / early live with strict backup discipline |
| Generic VPS (Hetzner, DigitalOcean, Contabo) + managed Postgres | Good price/performance, managed Postgres with PITR is one click on DO/Aiven/Neon | Regions are outside the UAE (latency ~100 ms+, residency questions for PDPL: ask the lawyer) | Solid default for launch |
| UAE/GCC cloud (AWS me-central-1, Azure UAE North, G42/Core42) | Data in the UAE, enterprise compliance story, managed Postgres + S3 + KMS | More expensive, more setup | Best if the lawyer or the gateway demands UAE residency |
| PaaS (Fly.io, Render, Railway) | Fast deploys, managed Postgres, TLS | Wildcard/custom domains vary, regions outside UAE, cost grows with traffic | Fine for staging |

Recommendation: pilot on one VPS (Docker compose, Caddy, managed Postgres with PITR, S3-compatible bucket, Cloudflare in front). Move to a UAE region if residency is required. Avoid running Postgres on the same box without off-box WAL archiving.

## Phase 3: security gates (see `docs/SECURITY.md`)

| # | Item | Owner | Status |
|---|---|---|---|
| 3.1 | Superadmin 2FA enrolled with recovery codes stored in the company password vault (`/superadmin/security`) | Founder | todo |
| 3.2 | `REQUIRE_SUPERADMIN_2FA` unset (default: enforced) in production; `EMAIL_TEST_OUTBOX` unset; `PAYMENTS_FAKE` off | Ops | todo |
| 3.3 | Step-up present on every money action (checklist in SECURITY.md section 4) | Engineering | todo |
| 3.4 | CSP report-only reviewed for a week, then `CSP_ENFORCE=1` and rebuild | Engineering | todo |
| 3.5 | External penetration test, findings fixed or accepted in writing | Security | todo |
| 3.6 | `npm audit --omit=dev` reviewed; Dependabot or weekly CI audit | Engineering | todo |
| 3.7 | Lighthouse/accessibility pass (WCAG AA) on signup, checkout, admin | Engineering | todo |

## Phase 4: email and notifications

| # | Item | Owner | Status |
|---|---|---|---|
| 4.1 | Resend (or another provider) account, sending domain verified with SPF, DKIM, DMARC; `EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, `EMAIL_FROM` | Ops | todo |
| 4.2 | Send a real password reset, verification decision, payout paid, quote received to Gmail, Outlook and a UAE domain; check spam placement | Ops | todo |
| 4.3 | Bounce/complaint handling (provider webhook or dashboard review) | Ops | todo |
| 4.4 | WhatsApp: Meta Tech Provider credentials (owner still has to provide) | Founder | blocked |

## Phase 5: observability

| # | Item | Owner | Status | Notes |
|---|---|---|---|---|
| 5.1 | Uptime checks (UptimeRobot/Better Stack) on `/api/health` (expects 200 and `ok:true`) from 2 regions, alert by SMS/WhatsApp, not only email | Ops | todo | `migrationsUpToDate:false` or `database:"unreachable"` also alert |
| 5.2 | Error tracking: Sentry (or GlitchTip self-hosted). Not integrated in code yet: add `@sentry/nextjs` with `SENTRY_DSN`, scrub request bodies and `Authorization`/cookie headers, release = `APP_VERSION` | Engineering | todo | Deliberately not added now: the SDK instruments every request and needs build config; do it in a dedicated change with a test |
| 5.3 | Structured logs shipped to a log service (retain 30+ days); redact emails/IBANs | Ops | todo | |
| 5.4 | Alerts: webhook failures, payout/ledger mismatch (reconciliation view), failed card charges, lockout spikes (`security.account_locked` audit rows), 5xx rate | Ops | todo | |
| 5.5 | Public status page | Ops | todo | |
| 5.6 | Cron jobs running (billing, purge, walk-in) with a dead-man check | Ops | todo | `CRON_SECRET` in an `Authorization` header |

## Phase 6: load and resilience

| # | Item | Owner | Status |
|---|---|---|---|
| 6.1 | k6 load test `web/loadtest/storefront.js` against staging: storefront, product page, checkout start with fake payments. Target to agree: p95 < 800 ms at 50 virtual users, error rate < 1% | Engineering | todo |
| 6.2 | Soak 30 minutes, watch DB connections (`postgres` pool) and memory | Engineering | todo |
| 6.3 | Failure drill: kill the app container, kill Redis, block the gateway host; confirm behaviour matches RUNBOOKS | Engineering | todo |

## Phase 7: pilot, then live

1. **Pilot (2 to 4 weeks)**: 3 to 5 friendly shops, **test-mode gateways only** (Stripe test keys, Mamo sandbox). Real signup, card setup, verification, orders, ledger, payout batch exported and "paid" against a fake bank reference. Daily check of `/superadmin` reconciliation. Collect bugs and support questions.
2. **Soft live**: live gateway keys, only verified shops, **low payout limit** (for example AED 2,000 per shop per week and a platform-wide daily cap), longer hold days (7+), manual review of every payout batch by two people if possible, daily reconciliation.
3. **Raise limits** gradually after 4 clean weeks (no unexplained ledger difference, no unhandled dispute).
4. Support: a named support inbox and WhatsApp number, response targets, escalation path to Engineering; runbooks printed.

## Go / no-go criteria (all must be true)

- [ ] Legal advice received and acted on for fund holding; gateway approvals in hand (0.1 to 0.2)
- [ ] Seller agreement, terms, privacy policy, refund policy published (Phase 1)
- [ ] Restore drill passed within the last 30 days; PITR proven (2.2)
- [ ] Superadmin 2FA on, step-up on all money actions, no `PAYMENTS_FAKE`, no test outbox (Phase 3)
- [ ] Pen test done, no open high/critical findings
- [ ] Reconciliation: gateway totals equal ledger totals for the whole pilot
- [ ] Alerts firing to a human who is on call; runbooks rehearsed once (failed payout, chargeback, key rotation)
- [ ] Email deliverability verified (4.2)
- [ ] Payout limits and hold days configured as in the soft-live plan
- [ ] Accountant sign-off on VAT/invoice treatment
- [ ] A rollback plan for the first deploy (previous image + DB snapshot)

## Still pending from the owner

Mamo docs (recurring + marketplace/recipients), Meta Tech Provider credentials, real logo file, native Arabic review, usage rates, support hours.
