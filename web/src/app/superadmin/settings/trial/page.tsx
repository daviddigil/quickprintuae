import Link from "next/link";
import { requireSuperadmin } from "@/lib/auth";
import { Alert, Button, Card, CardHeader, Field, Input } from "@/components/ui";
import { PageTitle } from "@/components/platform/PageTitle";
import { getTrialDays, MAX_TRIAL_DAYS } from "@/server/platform-settings";
import { saveTrialDays } from "./actions";

export const metadata = { title: "Free trial" };
export const dynamic = "force-dynamic";

export default async function TrialSettings({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  await requireSuperadmin();
  const sp = await searchParams;
  const days = await getTrialDays();
  return (
    <div className="space-y-6">
      <PageTitle title="Free trial" subtitle="How long a new shop can use QuickPrint before its card is charged. Applies to every plan." />
      <Link href="/superadmin/settings" className="text-sm text-on-surface-variant hover:underline">← Platform settings</Link>
      {sp.saved && <Alert tone="green">Saved. New signups now get {days} free days.</Alert>}
      {sp.error && <Alert>Enter a whole number of days from 0 to {MAX_TRIAL_DAYS}.</Alert>}
      <Card data-testid="trial-card">
        <CardHeader title="Trial length" subtitle="A card is required to start the trial and is charged automatically when it ends." />
        <form action={saveTrialDays} className="flex flex-wrap items-end gap-4 p-5">
          <Field label="Free trial (days)" hint={`0 = no trial, charged at once. Max ${MAX_TRIAL_DAYS}.`}>
            <Input name="trialDays" type="number" min={0} max={MAX_TRIAL_DAYS} step={1} defaultValue={days} required className="w-40" />
          </Field>
          <Button>Save trial length</Button>
        </form>
        <ul className="list-disc space-y-1 border-t border-outline-variant px-9 py-4 text-sm text-on-surface-variant">
          <li>Shops that are already on a trial keep the end date they were given. Use “Extend trial” on a shop page to change one shop.</li>
          <li>The pricing, signup and home pages show this number automatically.</li>
          <li>Offers can add extra trial days on top (see Offers).</li>
        </ul>
      </Card>
    </div>
  );
}
