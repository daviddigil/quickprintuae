import Link from "next/link";
import { Card, EmptyState, Table } from "@/components/ui";
import { PageTitle, fmtDateTime } from "@/components/platform/PageTitle";
import { listVerifications, QUEUE_STATUSES, slaHours, type VerificationStatus } from "@/server/trust/verification";
import { requireSuperadmin } from "@/lib/auth";
import { FlagBadges, SlaBadge } from "./components";
import { db, schema } from "@/db";
import { count, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Seller verifications" };

const TAB: Record<VerificationStatus, string> = { pending_review: "In review", needs_info: "Info requested", verified: "Verified", rejected: "Rejected", expired: "Expired" };

export default async function VerificationsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireSuperadmin();
  const sp = await searchParams;
  const status = (QUEUE_STATUSES as string[]).includes(sp.status ?? "") ? (sp.status as VerificationStatus) : "pending_review";
  const [rows, counts] = await Promise.all([
    listVerifications(status),
    db.select({ status: schema.sellerVerifications.status, n: count() }).from(schema.sellerVerifications).groupBy(schema.sellerVerifications.status),
  ]);
  const n = (s: string) => Number(counts.find((c) => c.status === s)?.n ?? 0);
  const [{ unsubmitted }] = await db.select({ unsubmitted: count() }).from(schema.tenants).where(eq(schema.tenants.verificationStatus, "unverified"));
  return (
    <>
      <PageTitle title="Seller verifications" subtitle={`${n("pending_review")} waiting for review · ${Number(unsubmitted)} shops have not submitted yet`} />
      <nav aria-label="Status" className="mb-4 flex flex-wrap gap-2">
        {QUEUE_STATUSES.map((s) => (
          <Link key={s} href={`/superadmin/verifications?status=${s}`} aria-current={s === status ? "page" : undefined}
            className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium ${s === status ? "border-primary bg-primary-container text-on-primary-container" : "border-outline-variant hover:bg-surface-container"}`}>
            {TAB[s]} <span className="tabular-nums text-on-surface-variant">{n(s)}</span>
          </Link>
        ))}
      </nav>
      <Card>
        {rows.length === 0 ? <EmptyState title={`Nothing in "${TAB[status]}"`} /> : (
          <Table head={["Shop", "Business and licence", "Authority", status === "pending_review" ? "Waiting" : "Submitted", "Flags", ""]}>
            {rows.map(({ v, shop, slug }) => (
              <tr key={v.id} data-testid="verification-row">
                <td className="px-4 py-3"><span className="font-medium">{shop}</span><div className="text-xs text-on-surface-variant">/{slug}</div></td>
                <td className="px-4 py-3">{v.legalName}<div className="text-xs text-on-surface-variant">Licence {v.licenceNumber}</div></td>
                <td className="px-4 py-3 text-xs">{v.authority}</td>
                <td className="px-4 py-3 text-xs">{status === "pending_review" ? <SlaBadge hours={slaHours(v.submittedAt)} /> : fmtDateTime(v.submittedAt)}</td>
                <td className="px-4 py-3"><FlagBadges flags={v.flags} /></td>
                <td className="px-4 py-3 text-end"><Link href={`/superadmin/verifications/${v.id}`} className="inline-flex min-h-11 items-center font-semibold text-primary hover:underline">Review</Link></td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
