# QuickPrint UAE

> **Powered by Nexsofture Tech**

A multi-tenant print-on-demand SaaS for UAE print shops. One deployment serves:

| Surface | URL | Who |
|---|---|---|
| Marketing site + signup | `quickprint.ae/`, `/pricing`, `/signup` | Print shop owners |
| Storefront (per shop) | `<slug>.quickprint.ae`, a custom domain, or `/s/<slug>` | Customers |
| Store admin panel | `/admin` | Shop owners & staff |
| Super admin (HQ) | `/superadmin` | Platform team. Includes impersonation and SaaS billing |

Products: documents (priced by paper size), confidential documents, photo prints (global sizes), passport/visa photos, framed prints, business cards (AI designer + editor), flyers, brochures, notebooks, posters.
Payments: Stripe and Mamo Pay, paid into each shop's own account. No cash on delivery.
Fulfilment: pickup, or a scheduled delivery slot handled by in-house drivers or a courier adapter (Jeebly, Quiqup, Careem Box, Aramex).

## Architecture

```
web/                      Next.js 15 (App Router) — UI + REST API in one deployable
  src/middleware.ts       host routing: <slug>.ROOT_DOMAIN / custom domain -> /s/<tenant>
  src/db/schema.ts        Drizzle ORM schema (PostgreSQL), all tenant data keyed by tenant_id
  src/lib/                pricing engine, auth (JWT cookie), crypto (AES-256-GCM), types
  src/server/             domain services: orders, storage, payments/, delivery/, ai/, billing/
  src/app/s/[tenant]/     storefront
  src/app/admin/          store admin panel
  src/app/superadmin/     platform HQ: shops, plans, SaaS invoices, audit log, impersonation
  src/app/api/v1/         REST endpoints (usable by future mobile apps)
  drizzle/                SQL migrations
docs/                     business plan, roadmap
```

Key design decisions:
- **Shared database, row-level tenancy.** Every tenant table has `tenant_id`, and every query is scoped by it. This is the simplest model to operate. Very large shops can move to their own deployment later.
- **Prices are computed on the server.** The storefront shows an estimate. Checkout recalculates every line with `src/lib/pricing.ts`.
- **Secrets are encrypted at rest.** Shop Stripe, Mamo and courier keys are encrypted with `ENCRYPTION_KEY`. So are confidential uploads, which are purged once the retention period ends.
- **Impersonation** issues a 2-hour session that carries `imp=<superadmin id>`. Every action taken during it is audit-logged with the impersonator. Use `/api/v1/superadmin/impersonate/stop` to exit.
- **SaaS billing** (`src/server/billing`): monthly invoices are subscription + order fee % of paid GMV + 5% VAT. Invoices are charged off-session through the platform Stripe account, with a hosted-checkout fallback. Dunning: past_due after 7 days, suspended after 21.

## Local development

Requires Node 22 and PostgreSQL 14+.

```bash
cd web
cp .env.example .env            # defaults work for local dev
npm install
npx drizzle-kit migrate         # create tables
npm run db:seed                 # plans, superadmin, demo store
# Problems? open http://localhost:3000/api/health (DB reachable / migrated / seeded)
npm run dev                     # http://localhost:3000
```

Seeded logins (dev only):
- Super admin: `admin@quickprint.ae` / the `SUPERADMIN_PASSWORD` from `.env` (default `change-me-now`; `admin12345` if unset) → `/superadmin`
- Demo shop owner: `owner@demo.ae` / `owner12345` → `/admin`
- Demo customer: `customer@demo.ae` / `customer123` → `/s/demo`

Useful scripts: `npm run typecheck`, `npm run lint`, `npx tsx --test $(find src -name '*.test.ts')`, `npm run db:generate` (after schema changes).

To test subdomain routing locally, set `ROOT_DOMAIN=lvh.me:3000` and open `http://demo.lvh.me:3000`. The `lvh.me` domain resolves to 127.0.0.1.

## Deployment

### Docker (single server)

```bash
export AUTH_SECRET=$(openssl rand -hex 32) ENCRYPTION_KEY=$(openssl rand -hex 32) CRON_SECRET=$(openssl rand -hex 16)
export APP_URL=https://quickprint.ae ROOT_DOMAIN=quickprint.ae
docker compose up -d --build
```

On start, the image applies migrations and runs the idempotent seed. Set `SEED_DEMO=false` and a strong `SUPERADMIN_PASSWORD` in `web/.env` for production. Uploads live on the `uploads` volume. Back up both that volume and Postgres.

**Back up `ENCRYPTION_KEY` and never rotate it casually.** If it is lost, stored payment keys and confidential files can no longer be decrypted.

### Where to host

Confidential documents and ID/passport photos are personal data under the UAE PDPL. Host in-region where possible:
- AWS `me-central-1` (UAE): ECS/Fargate or EC2, with RDS PostgreSQL and EFS or S3 for uploads.
- Azure UAE North, or a UAE VPS provider. Any Docker host works.

### DNS + TLS (wildcard subdomains and custom domains)

1. DNS: `A quickprint.ae` and `A *.quickprint.ae` → your server.
2. A shop's custom domain: they add `CNAME print.theirshop.ae → quickprint.ae`. You then set the domain on their tenant in `/superadmin/tenants/<id>`.
3. Put Caddy in front. On-demand TLS issues certificates for custom domains on first request. The `ask` endpoint (`/api/v1/superadmin/domain-check?domain=`) answers 200 only for domains that belong to a live tenant.

```caddyfile
{
  email ops@quickprint.ae
  on_demand_tls {
    ask http://web:3000/api/v1/superadmin/domain-check   # 200 only for known custom domains
  }
}

quickprint.ae, *.quickprint.ae {
  tls {
    dns cloudflare {env.CF_API_TOKEN}            # wildcard cert via DNS challenge
  }
  reverse_proxy web:3000
}

https:// {
  tls { on_demand }
  reverse_proxy web:3000
}
```

Traefik works too: use a wildcard certificate via DNS challenge, plus an HTTP-challenge resolver for custom domains.

### Webhooks to register

| Provider | URL | Owner |
|---|---|---|
| Platform Stripe (SaaS billing) | `/api/webhooks/platform-stripe` | Platform |
| Shop Stripe / Mamo Pay | shown in each shop's Admin → Settings → Payments | Each shop |

### Scheduled jobs

| Schedule | Request | Purpose |
|---|---|---|
| Daily 02:15 Asia/Dubai | `GET /api/v1/superadmin/cron/billing?secret=$CRON_SECRET` | Bill last month (idempotent), collect open invoices, end trials, dunning |
| Hourly | `GET /api/cron/purge?secret=$CRON_SECRET` | Delete confidential uploads past retention |

The `cron` service in `docker-compose.yml` runs the billing job. In the cloud, use EventBridge Scheduler, a Kubernetes CronJob, or a simple systemd timer.

## CI

`.github/workflows/ci.yml` runs typecheck, lint, unit tests, migrations + seed against Postgres, `next build`, and a Docker image build.

## Business docs

- [docs/BUSINESS_PLAN.md](docs/BUSINESS_PLAN.md): market, positioning, unit economics, 12-month P&L, go-to-market, risks, corrections to the original idea
- [docs/ROADMAP.md](docs/ROADMAP.md)

## AI banners (admin → Banners)

Shop owners create and edit storefront banners from plain-English prompts. Engine order, first one configured wins, then falls back:
1. **Open-source model (free)** — set `IMAGE_API_URL` to any server exposing OpenAI-compatible `POST /v1/images/generations` running e.g. Qwen-Image (Apache-2.0). Needs a GPU host.
2. **Nano Banana** — set `GEMINI_API_KEY` (`GEMINI_IMAGE_MODEL=gemini-2.5-flash-image`); supports true image editing.
3. **Built-in template** — always works, no key needed.

## Walk-in QR print queue (all plans, incl. Starter)

For a busy counter: the shop shows a QR (`/admin/walk-in` → poster). Customers scan, enter name + mobile, upload documents (documents only), pay online (Stripe/Mamo), and get a ticket with a live status page. Paid jobs enter a priority queue (high priority first, then first-come-first-served; short jobs get a boost) that a small **print agent** on the shop PC drains automatically. One-time walk-ins are saved by phone number.

- Shop: `/admin/walk-in` (live queue, QR + poster, settings, print agents, walk-in customers under Customers)
- Superadmin: per-plan feature flag (Plans), walk-in tiles on the dashboard, per-shop section with disable / open-as-shop
- Print agent: see `docs/PRINT_AGENT.md` (`print-agent/agent.mjs`, no dependencies)
- Schedule `GET /api/cron/walk-in?secret=$CRON_SECRET` hourly (docker-compose does this) — recovers stale claims, deletes orphan uploads, enforces file retention
- Tests: `npm test` (queue, phone, flags), `node e2e/walk-in.mjs` (full chain against a running server started with `PAYMENTS_FAKE=1`)

## Testing

```bash
npm test                      # 43 unit + DB tests (works on Windows/macOS/Linux; needs the DB)
npm run build && PAYMENTS_FAKE=1 DELIVERY_FAKE=1 npx next start -p 3200   # then, in another terminal:
node e2e/smoke-all.mjs        # crawls EVERY page as anonymous/customer/owner/superadmin/new-signup/legacy shop + fuzzes EVERY API route (fails on any 5xx)
node e2e/full-flow.mjs        # customer order -> payment -> production -> courier -> invoice -> impersonation
node e2e/walk-in.mjs          # walk-in QR queue -> real print agent (fake printer) -> status page
```
Note: signup is rate-limited (5/hour/IP, in memory) — restart the server between full smoke runs.

## Hero slider for offers (shop admin → Hero slider)

Owners upload their own offer images (JPG/PNG/WebP up to 5 MB, 1920×640 recommended) or create them with AI, add a headline, button label and link, set optional **start/end dates** (UAE time) and reorder up to 8 slides. Live slides appear as an auto-playing slider (dots, arrows, swipe) at the top of the storefront home; with no live slides the normal headline hero shows.
Security: file type is checked from the file bytes (SVG refused), links must be same-site paths or https, everything is tenant-scoped. Test: `node e2e/hero-slider.mjs`.

## WhatsApp AI chat cart (live)

Shops connect their existing WhatsApp Business number (**coexistence**: the owner keeps using the phone app) from `/admin/whatsapp` — via Facebook (Embedded Signup) or "Manual connect" with their own Meta app. Customers chat, the AI (Claude, or a built-in rule-based assistant without `ANTHROPIC_API_KEY`) quotes with the real pricing engine, builds a **conversational cart** and sends ONE itemised message with prefilled checkout links; files, slot and payment stay on the storefront. When the owner replies from the phone the AI pauses. **Try the AI without any WhatsApp number** with the "Try the AI (test chat)" box on that page.
Real numbers need a Meta app + review (checklist in `docs/WHATSAPP.md`). Verified against local mock Meta + Anthropic servers: `node e2e/mock-meta.mjs`, `node e2e/mock-anthropic.mjs`, then `node e2e/whatsapp-live.mjs` (see docs for the three app instances).


## Security, go-live and operations docs

- `docs/SECURITY.md` threat model, controls, CSRF review, known gaps
- `docs/GO_LIVE.md` phased go-live checklist (legal, infrastructure, observability, pilot, go/no-go)
- `docs/RUNBOOKS.md` failed payout, chargeback, fraud seller, gateway outage, webhooks, key rotation, DB restore
- `docs/LEGAL_CHECKLIST.md` documents to prepare (not legal advice)
- New env vars (see `web/.env.example`): `EMAIL_PROVIDER`, `EMAIL_FROM`, `RESEND_API_KEY`, `REDIS_URL` / `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`, `STORAGE_DRIVER` + `S3_*`, `REQUIRE_SUPERADMIN_2FA`, `CSP_ENFORCE` (build time), `APP_VERSION`.
- Rotate `ENCRYPTION_KEY` with `web/scripts/reencrypt.ts` (RUNBOOKS section 9). Load test: `web/loadtest/storefront.js` (k6).
