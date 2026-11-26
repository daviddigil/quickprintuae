import { requireStaff } from "@/lib/auth";
import { storePath } from "@/lib/tenant";
import { Alert, Badge, Card, CardHeader, LinkButton } from "@/components/ui";
import { PageHeader } from "@/components/admin/PageHeader";
import { dubai } from "@/components/admin/format";
import { getVerification } from "@/server/trust/verification";
import { VerificationForm, type FormDefaults } from "./verification-form";

export const metadata = { title: "Business verification" };
export const dynamic = "force-dynamic";

const TONE = { pending_review: "blue", needs_info: "yellow", verified: "green", rejected: "red", expired: "red" } as const;
const LABEL = { pending_review: "In review", needs_info: "More information needed", verified: "Verified", rejected: "Not approved", expired: "Licence expired" } as const;
const HIST_LABEL: Record<string, string> = { pending_review: "Submitted for review", needs_info: "More information requested", verified: "Verified", rejected: "Not approved", expired: "Licence expired", expiry_warning: "Expiry reminder sent", override: "Approved with a recorded exception" };

export default async function VerificationPage() {
  const { tenant } = await requireStaff({ ownerOnly: true });
  const v = await getVerification(tenant.id);
  const [authority, detail] = (v?.authority ?? "").split(": ");
  const defaults: FormDefaults | undefined = v ? {
    legalName: v.legalName, licenceNumber: v.licenceNumber, authority, authorityDetail: detail, licenceExpiry: v.licenceExpiry?.toISOString().slice(0, 10),
    activity: v.activity ?? "", signatoryName: v.signatoryName ?? "", trn: v.trn ?? "", hasDocument: !!v.documentKey,
  } : undefined;
  const daysLeft = v?.licenceExpiry ? Math.ceil((v.licenceExpiry.getTime() - Date.now()) / 86400_000) : null;
  const editable = !v || v.status === "needs_info" || v.status === "rejected" || v.status === "expired";

  return (
    <div className="space-y-6">
      <PageHeader title="Business verification" subtitle="Verify your trade licence to open your store for live orders, get paid out and appear in the Live stores directory." />

      {!v && (
        <Alert tone="blue">
          Until your business is verified your store stays in <b>preview</b>: you can set up products, prices and delivery, and your trial runs, but customers cannot order or pay and the store is not listed.
          {" "}<a className="font-medium underline" href={storePath(tenant.slug)}>See your store</a>
        </Alert>
      )}
      {v?.status === "pending_review" && <Alert tone="blue">We received your details on {dubai(v.submittedAt, "d MMM yyyy")}. We usually reply within 1 to 2 working days. You can keep setting up your store meanwhile; we will email you.</Alert>}
      {v?.status === "needs_info" && <Alert tone="yellow"><b>We need a little more information.</b> {v.reason}<br />Update the details below and resubmit.</Alert>}
      {v?.status === "rejected" && <Alert>Your submission was not approved.{v.reason ? <> Reason: <b>{v.reason}</b>.</> : null} Correct the details below and resubmit. If you think this is a mistake, contact support.</Alert>}
      {v?.status === "expired" && <Alert>Your trade licence has expired. Live orders, payouts and your directory listing are paused. Upload your renewed licence to resume.</Alert>}
      {v?.status === "verified" && (
        <Alert tone="green">
          Your business is verified{v.reviewedAt ? ` (${dubai(v.reviewedAt, "d MMM yyyy")})` : ""}. Your store is open for live orders.
          {daysLeft !== null && daysLeft <= 30 && <> Your licence expires in <b>{Math.max(0, daysLeft)} days</b>. Upload the renewed licence before then to keep payouts running.</>}
        </Alert>
      )}

      {v && (
        <Card>
          <CardHeader title="Your submission" action={<Badge tone={TONE[v.status as keyof typeof TONE] ?? "gray"} dot>{LABEL[v.status as keyof typeof LABEL] ?? v.status}</Badge>} />
          <dl className="grid gap-x-6 gap-y-3 p-5 text-sm sm:grid-cols-2">
            {([["Legal business name", v.legalName], ["Trade licence number", v.licenceNumber], ["Licensing authority", v.authority], ["Licence expiry", dubai(v.licenceExpiry, "d MMM yyyy")],
              ["Business activity", v.activity], ["Authorised signatory", v.signatoryName], ["TRN", v.trn ?? "Not provided"]] as const).map(([k, val]) => (
              <div key={k}><dt className="text-on-surface-variant">{k}</dt><dd className="font-medium">{val || "—"}</dd></div>
            ))}
            <div><dt className="text-on-surface-variant">Licence document</dt><dd>{v.documentKey ? <a className="font-medium text-primary underline" href={`/api/v1/verification/${v.id}/document`} target="_blank" rel="noopener noreferrer">Open document</a> : "—"}</dd></div>
          </dl>
          {v.history.length > 0 && (
            <div className="border-t border-outline-variant px-5 py-4">
              <h3 className="mb-2 text-sm font-semibold">History</h3>
              <ol className="space-y-1.5 text-sm">
                {[...v.history].reverse().map((h, i) => (
                  <li key={i} className="flex flex-wrap gap-x-3"><span className="text-on-surface-variant tabular-nums">{dubai(h.at, "d MMM yyyy, HH:mm")}</span><span className="font-medium">{HIST_LABEL[h.status] ?? h.status}</span>{h.note && h.status !== "override" && <span className="text-on-surface-variant">{h.note}</span>}</li>
                ))}
              </ol>
            </div>
          )}
        </Card>
      )}

      {editable && (
        <Card>
          <CardHeader title={v ? "Update and resubmit" : "Tell us about your business"} subtitle="Use the details exactly as printed on your trade licence." />
          <div className="p-5"><VerificationForm defaults={defaults} resubmit={!!v} /></div>
        </Card>
      )}
      {v?.status === "pending_review" && (
        <details className="rounded-shape-lg border border-outline-variant bg-surface-lowest">
          <summary className="min-h-11 cursor-pointer px-5 py-3 text-sm font-medium">Spotted a mistake? Correct and resubmit</summary>
          <div className="border-t border-outline-variant p-5"><VerificationForm defaults={defaults} resubmit /></div>
        </details>
      )}
      <p className="text-xs text-on-surface-variant">Questions? <LinkButton href="/admin/settings" variant="text" size="sm">Contact support from Settings</LinkButton></p>
    </div>
  );
}
