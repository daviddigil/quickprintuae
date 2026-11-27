import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { taxRecordRows, taxRecordsCsv } from "@/server/credit-notes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Accountant export (superadmin only): SaaS invoices and credit notes for a date range. ?from=YYYY-MM-DD&to=YYYY-MM-DD (inclusive, Dubai dates). */
export async function GET(req: Request) {
  const cu = await getCurrentUser();
  if (!cu || cu.user.role !== "superadmin") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const u = new URL(req.url).searchParams;
  const from = u.get("from") ?? "", to = u.get("to") ?? "";
  const ok = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
  if (!ok(from) || !ok(to)) return NextResponse.json({ error: "Use ?from=YYYY-MM-DD&to=YYYY-MM-DD" }, { status: 400 });
  // Dubai is UTC+4 with no DST: midnight Dubai = 20:00 UTC the day before; the end date is inclusive
  const start = new Date(`${from}T00:00:00+04:00`), end = new Date(new Date(`${to}T00:00:00+04:00`).getTime() + 24 * 3600_000);
  if (end <= start) return NextResponse.json({ error: "to must not be before from" }, { status: 400 });
  const csv = taxRecordsCsv(await taxRecordRows(start, end));
  await audit("tax_records.export", { from, to }, null);
  return new NextResponse(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="tax-records-${from}-to-${to}.csv"`, "cache-control": "no-store" } });
}
