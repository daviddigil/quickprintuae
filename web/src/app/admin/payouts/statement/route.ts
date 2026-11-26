import { getCurrentUser } from "@/lib/auth";
import { shopStatement, statementCsv } from "@/server/payouts/statement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** CSV of the signed-in owner's own ledger. Tenant comes from the session, never from the URL. */
export async function GET() {
  const cu = await getCurrentUser();
  if (!cu || !cu.session.tid || cu.user.role !== "owner") return new Response("Forbidden", { status: 403 });
  const s = await shopStatement(cu.session.tid, 5000);
  return new Response(statementCsv(s.lines), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="quickprint-statement-${new Date().toISOString().slice(0, 10)}.csv"`, "cache-control": "no-store" },
  });
}
