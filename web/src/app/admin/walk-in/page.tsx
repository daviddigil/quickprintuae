import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { QrCode, TriangleAlert } from "lucide-react";
import { db, schema } from "@/db";
import { requireStaff } from "@/lib/auth";
import { env } from "@/lib/env";
import { hasFeature } from "@/server/billing";
import { walkInSettings } from "@/server/walk-in/settings";
import { Alert, Button, Card, CardHeader, Field, Input, LinkButton, Select } from "@/components/ui";
import { PageHeader } from "@/components/admin/PageHeader";
import { Flash } from "@/components/admin/Flash";
import { WalkInQueue } from "@/components/admin/WalkInQueue";
import { WalkInAgents } from "@/components/admin/WalkInAgents";
import { WalkInCopy } from "@/components/admin/WalkInCopy";
import { loadWalkInQueue, walkInQrSvg, walkInUrl } from "./data";
import { saveWalkInSettings } from "./actions";

export const metadata = { title: "Walk-in queue" };

export default async function WalkInPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { tenant, user } = await requireStaff();
  const sp = await searchParams;
  if (!(await hasFeature(tenant, "walk_in_queue"))) {
    return (
      <div>
        <PageHeader title="Walk-in queue" subtitle="Let customers in a busy shop scan a QR code, upload documents, pay on their phone and join the print queue." />
        <Card className="p-8 text-center" data-testid="walkin-locked">
          <QrCode className="mx-auto mb-3 text-slate-400" size={36} />
          <h2 className="text-lg font-semibold">Walk-in QR print queue isn&apos;t included in your plan</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">Upgrade to the Growth plan or higher to give walk-in customers a QR code, take payment before printing and feed jobs straight to your printer.</p>
          <LinkButton href="/admin/billing" className="mt-5">View plans &amp; billing</LinkButton>
        </Card>
      </div>
    );
  }
  const s = walkInSettings(tenant);
  const url = walkInUrl(tenant);
  const [initial, qr, products] = await Promise.all([
    loadWalkInQueue(tenant.id),
    walkInQrSvg(url, 220),
    db.query.products.findMany({ where: and(eq(schema.products.tenantId, tenant.id), eq(schema.products.kind, "document"), eq(schema.products.active, true)), orderBy: [asc(schema.products.sortOrder)] }),
  ]);
  const anyOnline = initial.agents.some((a) => a.online);
  const isOwner = user.role === "owner";

  return (
    <div className="space-y-6">
      <PageHeader title="Walk-in queue" subtitle="Customers scan your QR, upload documents and pay on their phone. Paid jobs print in priority order." action={<LinkButton variant="secondary" href="/admin/walk-in/poster">Print QR poster</LinkButton>} />
      <Flash sp={sp} />
      {s.enabled && !anyOnline && (
        <Alert tone="yellow"><span className="flex items-center gap-2"><TriangleAlert size={16} />No print agent connected — jobs will wait in the queue. Add an agent below and install it on the PC connected to your printer.</span></Alert>
      )}
      {!s.enabled && <Alert tone="blue">Walk-in ordering is switched off — the QR code shows a &ldquo;not available&rdquo; message. Turn it on in Settings below.</Alert>}

      <WalkInQueue initial={initial} />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card data-testid="qr-card">
          <CardHeader title="Your QR code" subtitle="Show it at the counter" />
          <div className="space-y-3 p-5 text-center">
            <div className="mx-auto inline-block rounded-lg border bg-white p-2" data-testid="qr-svg" dangerouslySetInnerHTML={{ __html: qr }} />
            <p className="break-all text-xs text-slate-500" data-testid="walkin-url">{url}</p>
            <div className="flex justify-center gap-2"><WalkInCopy text={url} label="Copy link" /><LinkButton variant="secondary" href="/admin/walk-in/poster">Poster</LinkButton></div>
          </div>
        </Card>

        <Card className="lg:col-span-2" data-testid="settings-card">
          <CardHeader title="Walk-in settings" subtitle={isOwner ? undefined : "Only the shop owner can change these."} />
          <form action={saveWalkInSettings} className="grid gap-4 p-5 sm:grid-cols-2">
            <label className="flex items-center gap-2 text-sm font-medium sm:col-span-2"><input type="checkbox" name="enabled" defaultChecked={s.enabled} disabled={!isOwner} className="h-4 w-4" />Accept walk-in orders via QR</label>
            <div className="sm:col-span-2"><Field label="Document product used for pricing" hint="(price per page, paper sizes, colour, sides)">
              <Select name="productId" defaultValue={s.productId ?? ""} disabled={!isOwner}>
                <option value="">Automatic (first active document product)</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select></Field></div>
            <Field label="Small-job boost (pages)" hint="0 = off"><Input type="number" name="smallJobBoostPages" min={0} max={100} defaultValue={s.smallJobBoostPages} disabled={!isOwner} /></Field>
            <Field label="Delete files after printing (hours)"><Input type="number" name="fileRetentionHours" min={1} max={168} defaultValue={s.fileRetentionHours} disabled={!isOwner} /></Field>
            <Field label="Max files per visit"><Input type="number" name="maxFilesPerVisit" min={1} max={30} defaultValue={s.maxFilesPerVisit} disabled={!isOwner} /></Field>
            <p className="self-end text-xs text-slate-500">Jobs with this many pages or fewer jump ahead of longer jobs, so a 1-page print never waits behind a 300-page one.</p>
            {isOwner && <div className="sm:col-span-2"><Button>Save settings</Button></div>}
          </form>
        </Card>
      </div>

      <WalkInAgents agents={initial.agents} appUrl={env.appUrl} isOwner={isOwner} />
      <p className="text-sm text-slate-500">Saved walk-in customers (by phone number) are listed under <Link className="font-medium text-brand-600" href="/admin/customers">Customers</Link>.</p>
    </div>
  );
}
