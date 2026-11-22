# QuickPrint UAE

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
npm run dev                     # http://localhost:3000
```

Seeded logins (dev only):
- Super admin: `admin@quickprint.ae` / `admin12345` → `/superadmin`
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
