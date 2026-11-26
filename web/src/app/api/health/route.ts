import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { readFileSync } from "node:fs";
import path from "node:path";
import { db } from "@/db";
import { activeGateways } from "@/server/payments/platform";
import { emailProvider } from "@/server/email";
import { rateLimitBackend } from "@/server/billing/rate-limit";

export const dynamic = "force-dynamic";

const VERSION = process.env.APP_VERSION || process.env.GIT_SHA || process.env.npm_package_version || "dev";

/** Number of migrations shipped with this build (drizzle/meta/_journal.json), if readable. */
function shippedMigrations(): number | null {
  try { return (JSON.parse(readFileSync(path.join(process.cwd(), "drizzle/meta/_journal.json"), "utf8")) as { entries: unknown[] }).entries.length; } catch { return null; }
}

/**
 * Public-safe health: booleans, counts and timings only. No secrets, hostnames, key names or connection strings.
 * 200 only when the DB is reachable, migrated and seeded (use it for uptime checks and the Docker healthcheck).
 */
export async function GET() {
  const out: Record<string, unknown> = { app: "ok", version: VERSION, env: process.env.NODE_ENV, time: new Date().toISOString() };
  try {
    const t0 = Date.now();
    await db.execute(sql`select 1`);
    out.database = "ok";
    out.dbLatencyMs = Date.now() - t0;
    const rows = await db.execute(sql`select
      to_regclass('public.tenants') is not null as tenants, to_regclass('public.print_jobs') is not null as print_jobs,
      to_regclass('public.banners') is not null as banners, to_regclass('public.whatsapp_accounts') is not null as whatsapp`);
    const t = (rows as unknown as Record<string, boolean>[])[0] ?? {};
    out.migrated = !!(t.tenants && t.print_jobs && t.banners && t.whatsapp);
    if (!out.migrated) out.hint = "Database is reachable but tables are missing/old. Run: npm run db:migrate";
    else {
      const [n] = (await db.execute(sql`select count(*)::int as n from plans`)) as unknown as { n: number }[];
      out.seeded = (n?.n ?? 0) > 0;
      if (!out.seeded) out.hint = "Run: npm run db:seed";
      const applied = await db.execute(sql`select count(*)::int as n from drizzle.__drizzle_migrations`).then((r) => (r as unknown as { n: number }[])[0]?.n ?? null).catch(() => null);
      const shipped = shippedMigrations();
      out.migrationsApplied = applied;
      if (shipped !== null && applied !== null) { out.migrationsShipped = shipped; out.migrationsUpToDate = applied >= shipped; }
    }
    try { out.gateways = { liveReady: (await activeGateways()).length > 0, fakeMode: process.env.PAYMENTS_FAKE === "1" || process.env.PAYMENTS_FAKE === "true" }; } catch { out.gateways = { liveReady: false, error: true }; }
  } catch {
    out.database = "unreachable";
    out.hint = "Cannot connect to PostgreSQL. Check it is running and DATABASE_URL in .env is correct.";
  }
  out.email = { provider: emailProvider() || "none", configured: emailProvider() === "resend" ? !!process.env.RESEND_API_KEY : emailProvider() === "console" };
  out.storage = { driver: process.env.STORAGE_DRIVER === "s3" ? "s3" : "local" };
  out.rateLimit = { backend: rateLimitBackend() };
  const ok = out.database === "ok" && out.migrated === true && out.seeded === true;
  return NextResponse.json({ ok, ...out }, { status: ok ? 200 : 503, headers: { "cache-control": "no-store" } });
}
