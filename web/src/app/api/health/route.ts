import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";

export const dynamic = "force-dynamic";

/** Setup diagnostic (no secrets): is the DB reachable, migrated and seeded? */
export async function GET() {
  const out: Record<string, unknown> = { app: "ok", time: new Date().toISOString() };
  try {
    await db.execute(sql`select 1`);
    out.database = "ok";
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
    }
  } catch {
    out.database = "unreachable";
    out.hint = "Cannot connect to PostgreSQL. Check it is running and DATABASE_URL in .env is correct.";
  }
  const ok = out.database === "ok" && out.migrated === true && out.seeded === true;
  return NextResponse.json({ ok, ...out }, { status: ok ? 200 : 503 });
}
