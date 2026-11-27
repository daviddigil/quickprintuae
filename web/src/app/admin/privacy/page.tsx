import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireStaff } from "@/lib/auth";
import { Badge, Button, Card, CardHeader, Field, Select, Textarea } from "@/components/ui";
import { Flash } from "@/components/admin/Flash";
import { PageTitle, fmtDateTime } from "@/components/platform/PageTitle";
import { DSR_DUE_DAYS } from "@/lib/compliance";
import { fileOwnRequest } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Privacy" };

export default async function OwnerPrivacyPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { user } = await requireStaff({ ownerOnly: true });
  const sp = await searchParams;
  const mine = await db.select().from(schema.dataSubjectRequests).where(eq(schema.dataSubjectRequests.userId, user.id)).orderBy(desc(schema.dataSubjectRequests.createdAt)).limit(20);
  const own = mine.filter((r) => r.tenantId === null);
  return (
    <div className="max-w-2xl space-y-6">
      <PageTitle title="My privacy" subtitle={`Ask QuickPrint for a copy of the personal data we hold about you as a shop owner, or for it to be corrected or erased. We answer within ${DSR_DUE_DAYS} days. Records we must keep by law (invoices, billing) are retained.`} />
      <Flash sp={sp} />
      <Card>
        <CardHeader title="New request" />
        <form action={fileOwnRequest} className="space-y-4 px-5 pb-5">
          <Field label="Request type">
            <Select name="kind" required defaultValue="access">
              <option value="access">Access: send me my data</option>
              <option value="correction">Correct my data</option>
              <option value="erasure">Erase my data (closes the account)</option>
              <option value="objection">Object to a use of my data</option>
            </Select>
          </Field>
          <Field label="Details (optional)"><Textarea name="note" rows={3} maxLength={2000} /></Field>
          <Button>Send request</Button>
        </form>
      </Card>
      <Card>
        <CardHeader title="Your requests" />
        <ul className="divide-y divide-outline-variant/60 px-5 pb-3 text-sm" data-testid="own-requests">
          {own.length === 0 && <li className="py-3 text-on-surface-variant">None yet.</li>}
          {own.map((r) => <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-3"><span className="capitalize">{r.kind} · {fmtDateTime(r.createdAt)}</span><Badge tone={r.status === "completed" ? "green" : r.status === "rejected" ? "gray" : "blue"}>{r.status.replace("_", " ")}</Badge></li>)}
        </ul>
      </Card>
    </div>
  );
}
