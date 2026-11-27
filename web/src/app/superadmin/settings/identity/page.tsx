import Link from "next/link";
import { requireSuperadmin } from "@/lib/auth";
import { Alert, Button, Card, CardHeader, Field, Input, Textarea } from "@/components/ui";
import { PageTitle } from "@/components/platform/PageTitle";
import { getPlatformIdentity } from "@/server/platform-identity";
import { savePlatformIdentity } from "./actions";

export const metadata = { title: "Platform identity" };
export const dynamic = "force-dynamic";

export default async function PlatformIdentitySettings({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  await requireSuperadmin();
  const sp = await searchParams;
  const i = await getPlatformIdentity();
  return (
    <div className="space-y-6">
      <PageTitle title="Platform identity" subtitle="The legal entity that issues SaaS invoices, credit notes and commission / payout statements." />
      <Link href="/superadmin/settings" className="text-sm text-on-surface-variant hover:underline">← Platform settings</Link>
      {sp.saved && <Alert tone="green">Saved.</Alert>}
      {sp.error && <Alert>{sp.error}</Alert>}
      <Card data-testid="identity-card">
        <CardHeader title="Legal entity" subtitle="Confirm every value with your accountant. A VAT-registered business must show its 15-digit TRN on tax invoices." />
        <form action={savePlatformIdentity} className="grid gap-4 p-5 md:grid-cols-2">
          <Field label="Legal name"><Input name="legalName" defaultValue={i.legalName} maxLength={200} /></Field>
          <Field label="TRN (VAT number)"><Input name="trn" defaultValue={i.trn} inputMode="numeric" maxLength={15} placeholder="100XXXXXXXXXXX3" /></Field>
          <Field label="Email"><Input type="email" name="email" defaultValue={i.email} /></Field>
          <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" name="vatRegistered" defaultChecked={i.vatRegistered} />VAT registered (documents are titled &quot;Tax Invoice&quot;)</label>
          <div className="md:col-span-2"><Field label="Registered address"><Textarea name="address" rows={2} defaultValue={i.address} /></Field></div>
          <div className="md:col-span-2"><Button>Save identity</Button></div>
        </form>
      </Card>
    </div>
  );
}
