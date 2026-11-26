# Run QuickPrint UAE on your computer
_Powered by Nexsofture Tech_

## The easy way (Docker) — one double-click
1. Install **Docker Desktop** (https://www.docker.com/products/docker-desktop/) and **open it** — wait until it says it is running.
2. Get the project: `git clone https://github.com/daviddigil/quickprintuae.git` (or download the ZIP from GitHub and unzip it).
3. Start it:
   - **Windows:** double-click **`start-local.bat`**
   - **Mac / Linux:** open a terminal in the folder and run **`./start-local.sh`**
4. Wait 3–5 minutes the first time. Your browser opens at **http://localhost:5050/s/demo** by itself.

Logins: shop owner `owner@demo.ae` / `owner12345` · superadmin `admin@quickprint.ae` / `change-me-now` (at http://localhost:5050/login).
Stop it: `stop-local.bat` / `./stop-local.sh`. Port 5050 taken? Open the `.env` file the script created and change `WEB_PORT=5050`.
This trial mode **simulates payment and couriers** (no real money moves). Never use it as-is for a real shop.

**If the page doesn't open:** check http://localhost:5050/api/health — it says if the database or setup is the problem. Or run `docker compose logs web` and send me the last lines.


## Developer mode: `npm run dev` inside Docker (live reload)
Use this when you want to change the code and see it update in the browser instantly.
```
docker compose -f docker-compose.dev.yml up
```
- Needs only Docker Desktop (no Node.js, no PostgreSQL on your computer). The first start installs packages, so wait ~2–3 minutes until the log says `Ready`.
- Open **http://localhost:5050** (port: `WEB_PORT=5060 docker compose -f docker-compose.dev.yml up`). Same logins as above.
- Edit files in the `web/` folder with your editor — the browser reloads by itself.
- Stop: `Ctrl+C`, then `docker compose -f docker-compose.dev.yml down` (add `-v` to also delete the dev database).
- Prefer running `npm run dev` directly on your computer? Start only the database in Docker with a fixed port: `DB_PORT=5434 docker compose -f docker-compose.dev.yml up -d db` (PowerShell: `$env:DB_PORT="5434"` first), then `cd web`, `cp .env.example .env`, set `DATABASE_URL=postgres://qp:qp@localhost:5434/quickprint` in `.env`, and run `npm install && npm run db:migrate && npm run db:seed && npm run dev -- -p 5050`.
- **Important:** the app only works when the **web** container (or `npm run dev`) is running. If Docker Desktop shows only a database container, the app is not started — run the `up` command above.
- Payment and couriers are simulated in this mode.

---
## Manual setup (without the scripts)
## 1. Install once
- Node.js 22+  (https://nodejs.org)
- Docker Desktop (https://docker.com) — easiest way to get PostgreSQL

## 2. Start the database
```
docker run -d --name qp-db -p 5432:5432 -e POSTGRES_USER=qp -e POSTGRES_PASSWORD=qp -e POSTGRES_DB=quickprint postgres:16
```

## 3. Unzip, then in the `web` folder
```
cd web
cp .env.example .env          (Windows: copy .env.example .env)
npm install
npm run db:migrate
npm run db:seed
```

## 4. Run (the demo switches simulate payment + courier; in plain `npm run dev` payment is simulated automatically when a shop has no Stripe keys)
Mac/Linux:
```
PAYMENTS_FAKE=1 DELIVERY_FAKE=1 npm run dev
```
Windows PowerShell:
```
$env:PAYMENTS_FAKE="1"; $env:DELIVERY_FAKE="1"; npm run dev
```

### Ports
QuickPrint uses **5050** by default (so it doesn't clash with other apps on 3000/4000). Change it if 5050 is taken:
Docker: `WEB_PORT=5060 docker compose up -d --build` (PowerShell: `$env:WEB_PORT="5060"`), then open http://localhost:5060.
Without Docker: `npm run dev -- -p 5050`.

## 5. If you see errors — check this first
Open http://localhost:5050/api/health . It tells you exactly what is wrong:
- `database: unreachable` → PostgreSQL isn't running (start the Docker container from step 2) or `DATABASE_URL` in `.env` is wrong
- `migrated: false` → run `npm run db:migrate`
- `seeded: false` → run `npm run db:seed`
Requires Node 22+. Use the zip/clone from the SAME version of the code as the database (old zips have fewer tables).

## 6. Open in your browser
- Store:        http://localhost:5050/s/demo       (customer@demo.ae / customer123)
- Shop admin:   http://localhost:5050/login        (owner@demo.ae / owner12345)
- Superadmin:   http://localhost:5050/login        (admin@quickprint.ae / change-me-now)
- Platform site http://localhost:5050/


## Security and email settings (new)

All optional locally; see `web/.env.example` and `docs/SECURITY.md`.

- **2FA**: superadmin must enrol at `/superadmin/security` when `NODE_ENV=production`. When you run a production build locally (for tests) set `REQUIRE_SUPERADMIN_2FA=0`. Shop owners can opt in under Store settings.
- **Password reset**: `/forgot-password`. Locally `EMAIL_PROVIDER=console` prints the reset link in the terminal running the server. Set `EMAIL_PROVIDER=resend`, `RESEND_API_KEY` and `EMAIL_FROM` for real email.
- **Lockout**: 5 wrong passwords lock an account for 15 minutes (clear with `update users set failed_logins=0, locked_until=null where email='...'`).
- **Rate limits** are in memory; set `REDIS_URL` or `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` when running more than one instance.
- **File storage**: `STORAGE_DRIVER=s3` plus `S3_*` to use a bucket instead of the `UPLOAD_DIR` folder.
- **Health**: `GET /api/health` shows DB latency, migrations, gateway readiness (booleans only).
- Security e2e: start a server with `PAYMENTS_FAKE=1 EMAIL_PROVIDER=console EMAIL_TEST_OUTBOX=1 REQUIRE_SUPERADMIN_2FA=0`, then `cd web && BASE=http://localhost:PORT node --import tsx e2e/security.mjs`.
