import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { getCurrentUser } from "@/lib/auth";

/** CSV of every order's commission for a month (superadmin only). ?m=YYYY-MM */
export async function GET(req: Request) {
  const cu = await getCurrentUser();
  if (!cu || cu.user.role !== "superadmin") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const m = new URL(req.url).searchParams.get("m") ?? "";
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(m)) return NextResponse.json({ error: "Use ?m=YYYY-MM" }, { status: 400 });
  const [y, mo] = m.split("-").map(Number);
  const start = new Date(Date.UTC(y, mo - 1, 1)).toISOString(), end = new Date(Date.UTC(y, mo, 1)).toISOString();
  const rows = await db.execute(sql`
    select t.name as shop, t.slug, o.number as order_number, to_char(o.paid_at at time zone 'Asia/Dubai', 'YYYY-MM-DD HH24:MI') as paid_at,
      c.basis::float8, c.jobs, c.pct::float8, c.per_job_fee::float8, c.fee::float8, c.rule_source, c.plan_code, c.status, i.number as invoice_number
    from order_commissions c join orders o on o.id = c.order_id join tenants t on t.id = c.tenant_id left join saas_invoices i on i.id = c.invoice_id
    where o.paid_at >= ${start}::timestamptz and o.paid_at < ${end}::timestamptz order by o.paid_at`);
  const esc = (v: unknown) => { let s = v === null || v === undefined ? "" : String(v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }; // also blocks CSV/formula injection
  const head = ["shop", "slug", "order", "paid_at_dubai", "basis_aed", "print_jobs", "pct", "per_job_fee", "commission_aed", "rule", "plan", "status", "invoice"];
  const lines = [head.join(",")];
  for (const r of rows as unknown as Record<string, unknown>[]) lines.push([r.shop, r.slug, r.order_number, r.paid_at, r.basis, r.jobs, r.pct, r.per_job_fee, r.fee, r.rule_source, r.plan_code, r.status, r.invoice_number].map(esc).join(","));
  return new NextResponse(lines.join("\n") + "\n", { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="commissions-${m}.csv"`, "cache-control": "no-store" } });
}
