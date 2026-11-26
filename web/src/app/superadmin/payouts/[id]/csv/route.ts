import { getCurrentUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { batchCsv } from "@/server/payouts/batches";
import { stepUpForMoney } from "@/server/payouts/stepup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Bank transfer CSV with full IBANs: the one bulk-decryption point. Superadmin only, step-up protected, audited. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const cu = await getCurrentUser();
  if (!cu || cu.user.role !== "superadmin") return new Response("Forbidden", { status: 403 });
  const { id } = await params;
  await stepUpForMoney("payout_export", `/superadmin/payouts/${id}`);
  const r = await batchCsv(id);
  if (!r.ok) return new Response(r.error, { status: 409 });
  await audit("payout.csv_exported", { batchId: id, number: r.number });
  return new Response(r.csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${r.number}.csv"`, "cache-control": "no-store" } });
}
