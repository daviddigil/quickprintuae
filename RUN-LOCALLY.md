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

## 4. Run (the demo switches simulate payment + courier; in plain `npm run dev` payment is simulated automatically when a shop has no Stripe/Mamo keys)
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
