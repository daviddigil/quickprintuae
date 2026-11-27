import { desc, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireSuperadmin } from "@/lib/auth";
import { Alert } from "@/components/ui";
import { PageTitle } from "@/components/platform/PageTitle";
import { DsrQueue } from "@/components/admin/DsrQueue";
import { savePlatformRequest } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Privacy requests" };

export default async function PlatformPrivacyRequests({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  await requireSuperadmin();
  const sp = await searchParams;
  const rows = await db.select().from(schema.dataSubjectRequests).where(isNull(schema.dataSubjectRequests.tenantId)).orderBy(desc(schema.dataSubjectRequests.createdAt)).limit(200);
  return (
    <div className="space-y-4">
      <PageTitle title="Platform privacy requests" subtitle="Requests from shop owners about their own account data (QuickPrint is the controller of this data). Customer requests go to each shop's own inbox. Records the law requires us to keep (invoices) stay." />
      {sp.error && <Alert tone="red">{sp.error}</Alert>}
      {sp.ok && <Alert tone="green">{sp.ok}</Alert>}
      <DsrQueue rows={rows} save={savePlatformRequest} />
    </div>
  );
}
