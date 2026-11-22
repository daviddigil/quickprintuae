# Run QuickPrint UAE on your computer

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

## 4. Run
Mac/Linux:
```
PAYMENTS_FAKE=1 DELIVERY_FAKE=1 npm run dev
```
Windows PowerShell:
```
$env:PAYMENTS_FAKE="1"; $env:DELIVERY_FAKE="1"; npm run dev
```

## 5. Open in your browser
- Store:        http://localhost:3000/s/demo       (customer@demo.ae / customer123)
- Shop admin:   http://localhost:3000/login        (owner@demo.ae / owner12345)
- Superadmin:   http://localhost:3000/login        (admin@quickprint.ae / change-me-now)
- Platform site http://localhost:3000/
