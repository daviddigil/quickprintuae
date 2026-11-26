import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireSuperadmin } from "@/lib/auth";
import { Alert, Badge, Card, CardHeader, Table } from "@/components/ui";
import { PageTitle, fmtDate, fmtDateTime } from "@/components/platform/PageTitle";
import { VerificationBadge } from "@/components/superadmin/VerificationBadge";
import { duplicateMatches } from "@/server/trust/guards";
import { slaHours } from "@/server/trust/verification";
import { sniffDocument } from "@/lib/trust/verification";
import { getFile } from "@/server/storage";
import { FlagBadges, SlaBadge } from "../components";
import { removeBlockAction } from "../actions";
import { ReviewPanel } from "./review-panel";

export const dynamic = "force-dynamic";

export default async function VerificationDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  await requireSuperadmin();
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const v = await db.query.sellerVerifications.findFirst({ where: eq(schema.sellerVerifications.id, id) });
  if (!v) notFound();
  const [tenant, owner, matches, blocks] = await Promise.all([
    db.query.tenants.findFirst({ where: eq(schema.tenants.id, v.tenantId) }),
    db.query.users.findFirst({ where: and(eq(schema.users.tenantId, v.tenantId), eq(schema.users.role, "owner")) }),
    duplicateMatches(v),
    db.query.blocklist.findMany({ limit: 50 }),
  ]);
  if (!tenant) notFound();
  const relevantBlocks = blocks.filter((b) => (b.kind === "licence" && b.value === v.licenceNumberNorm) || (b.kind === "name" && b.value === v.legalNameNorm));
  let docKind: ReturnType<typeof sniffDocument> = null;
  if (v.documentKey) { try { docKind = sniffDocument(await getFile(v.documentKey, true)); } catch { docKind = null; } }
  const docUrl = `/api/v1/verification/${v.id}/document`;
  const expired = !!v.licenceExpiry && v.licenceExpiry.getTime() <= Date.now();
  const cardOk = tenant.cardStatus === "on_file";
  const canApprove = v.status !== "verified" && cardOk && !expired;
  const blockedReason = !cardOk ? "The owner has no card on file yet, so this cannot be approved." : expired ? "The licence has expired." : undefined;
  const open = v.flags.filter((f) => f !== "override");

  const row = (k: string, val: React.ReactNode) => <div key={k}><dt className="text-xs text-on-surface-variant">{k}</dt><dd className="text-sm font-medium">{val || "—"}</dd></div>;
  return (
    <>
      <Link href="/superadmin/verifications" className="text-sm text-on-surface-variant hover:underline">← Verification queue</Link>
      <PageTitle title={`${tenant.name}: ${v.legalName}`} subtitle={`Submitted ${fmtDateTime(v.submittedAt)}`} action={<VerificationBadge status={v.status} />} />
      {sp.ok && <div className="mb-4"><Alert tone="green">{sp.ok}</Alert></div>}
      {sp.error && <div className="mb-4"><Alert>{sp.error}</Alert></div>}
      {v.status === "pending_review" && <p className="mb-4"><SlaBadge hours={slaHours(v.submittedAt)} /></p>}
      {open.length > 0 && <div className="mb-4"><Alert tone="yellow"><b>Review flags:</b> <FlagBadges flags={v.flags} /> Approving needs a written reason.</Alert></div>}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Submitted by the shop" />
          <dl className="grid gap-4 p-5 sm:grid-cols-2">
            {row("Legal business name", v.legalName)}{row("Trade licence number", v.licenceNumber)}{row("Licensing authority", v.authority)}
            {row("Licence expiry", <>{fmtDate(v.licenceExpiry)}{expired && <> <Badge tone="red">expired</Badge></>}</>)}
            {row("Business activity", v.activity)}{row("Authorised signatory", v.signatoryName)}{row("TRN", v.trn)}
            {row("Normalised keys", <span className="font-mono text-xs">{v.licenceNumberNorm} · {v.legalNameNorm}</span>)}
          </dl>
        </Card>
        <Card>
          <CardHeader title="Shop and owner" action={<Link href={`/superadmin/tenants/${tenant.id}`} className="text-sm text-primary hover:underline">Open shop</Link>} />
          <dl className="grid gap-4 p-5 sm:grid-cols-2">
            {row("Shop", `${tenant.name} (/${tenant.slug})`)}{row("Owner", owner ? `${owner.name}` : "—")}{row("Owner email", owner?.email)}{row("Owner phone", owner?.phone)}
            {row("Card on file", cardOk ? `${tenant.billingRef?.cardBrand ?? "Card"} •••• ${tenant.billingRef?.cardLast4 ?? ""}` : <Badge tone="red">none</Badge>)}
            {row("Signed up", fmtDate(tenant.createdAt))}{row("Emirate", tenant.emirate)}{row("Shop status", tenant.status.replace("_", " "))}
          </dl>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card data-testid="document-viewer">
          <CardHeader title="Licence document" action={v.documentKey ? <a href={docUrl} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-primary hover:underline">Open in new tab</a> : undefined} />
          <div className="p-5">
            {!v.documentKey || !docKind ? <p className="text-sm text-on-surface-variant">No readable document on file.</p>
              : docKind.mime.startsWith("image/")
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={docUrl} alt={`Trade licence of ${v.legalName}`} className="max-h-[70vh] w-full rounded-shape-md border border-outline-variant object-contain" />
                : <p className="text-sm">PDF document. <a href={docUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary underline">Open the PDF</a> (served only to signed-in reviewers).</p>}
          </div>
        </Card>
        <Card>
          <CardHeader title="Decision" />
          <div className="p-5">
            {v.status === "verified" && <p className="mb-4 text-sm text-on-surface-variant">Already verified. You can still reject or request information (for example, if fraud is found later).</p>}
            <ReviewPanel id={v.id} flagged={open.length > 0} canApprove={canApprove} blockedReason={blockedReason} />
          </div>
        </Card>
      </div>

      <Card className="mt-6" data-testid="duplicate-matches">
        <CardHeader title="Matches on other shops" subtitle="Same or similar licence number, business name or TRN. Hard duplicates cannot be saved; these are the ones that slipped through as similar." />
        {matches.length === 0 ? <p className="px-5 py-4 text-sm text-on-surface-variant">No matches.</p> : (
          <Table head={["Shop", "Business", "Licence", "Status", "Why"]}>
            {matches.map((m) => (
              <tr key={m.id}><td className="px-4 py-2.5"><Link href={`/superadmin/tenants/${m.tenantId}`} className="font-medium hover:underline">{m.shop}</Link></td>
                <td className="px-4 py-2.5">{m.legalName}</td><td className="px-4 py-2.5 font-mono text-xs">{m.licenceNumber}</td>
                <td className="px-4 py-2.5"><VerificationBadge status={m.status} /></td><td className="px-4 py-2.5 text-xs">{m.reasons.join(", ")}</td></tr>
            ))}
          </Table>
        )}
      </Card>

      {relevantBlocks.length > 0 && (
        <Card className="mt-6">
          <CardHeader title="Blocklist entries for this seller" />
          <ul className="divide-y divide-outline-variant text-sm">
            {relevantBlocks.map((b) => (
              <li key={b.id} className="space-y-2 px-5 py-3">
                <p><Badge tone="red">{b.kind}</Badge> <span className="font-mono text-xs">{b.value}</span> {b.reason}</p>
                <form action={removeBlockAction} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="blockId" value={b.id} /><input type="hidden" name="back" value={`/superadmin/verifications/${v.id}`} />
                  <label className="text-xs">Reason for removing (audited)<input name="reason" required minLength={10} className="ms-2 min-h-11 rounded-shape-md border border-outline-variant px-3 text-sm" /></label>
                  <button className="min-h-11 rounded-shape-md border border-outline px-4 text-sm font-semibold">Remove block</button>
                </form>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="mt-6">
        <CardHeader title="History" />
        <ol className="divide-y divide-outline-variant text-sm">
          {[...v.history].reverse().map((h, i) => (
            <li key={i} className="flex flex-wrap gap-x-4 px-5 py-2.5"><span className="tabular-nums text-on-surface-variant">{fmtDateTime(new Date(h.at))}</span><span className="font-medium">{h.status.replace("_", " ")}</span>{h.note && <span className="text-on-surface-variant">{h.note}</span>}</li>
          ))}
        </ol>
      </Card>
    </>
  );
}
