import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireStaff } from "@/lib/auth";
import { Alert } from "@/components/ui";
import { PageTitle } from "@/components/platform/PageTitle";
import { DsrQueue } from "@/components/admin/DsrQueue";
import { DSR_DUE_DAYS } from "@/lib/compliance";
import { eraseNow, saveRequest } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Privacy requests" };

export default async function PrivacyRequestsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { tenant } = await requireStaff({ ownerOnly: true });
  const sp = await searchParams;
  const rows = await db.select().from(schema.dataSubjectRequests).where(eq(schema.dataSubjectRequests.tenantId, tenant.id)).orderBy(desc(schema.dataSubjectRequests.createdAt)).limit(200);
  return (
    <div className="space-y-4">
      <PageTitle title="Customer privacy requests" subtitle={`Your customers can ask for a copy of their data or for it to be erased. You are the controller of this data: answer within ${DSR_DUE_DAYS} days. "Erase now" anonymises the customer and deletes their files but keeps order and invoice records.`} />
      {sp.error && <Alert tone="red">{sp.error}</Alert>}
      {sp.ok && <Alert tone="green">{sp.ok}</Alert>}
      <DsrQueue rows={rows} save={saveRequest} erase={eraseNow} exportHref={(id) => `/admin/privacy-requests/${id}/export`} />
    </div>
  );
}
