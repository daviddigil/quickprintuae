import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { planDesignLimit } from "@/server/ai/card-quota";
import { requireStaff } from "@/lib/auth";
import { env } from "@/lib/env";
import { EMIRATES } from "@/lib/types";
import { AREAS } from "@/lib/areas";
import { Alert, Button, Card, CardHeader, Field, Input, Select, Textarea } from "@/components/ui";
import { PageHeader } from "@/components/admin/PageHeader";
import { Flash } from "@/components/admin/Flash";
import { saveStoreSettings } from "../actions";
import { listLegalAcceptances } from "@/server/legal";
import { LEGAL_KEYS, LEGAL_PATHS, LEGAL_VERSION, needsReaccept } from "@/lib/legal";
import { fmtDateTime } from "@/components/platform/PageTitle";
import { TwoFactorPanel } from "@/components/security/TwoFactorPanel";

export const metadata = { title: "Store settings" };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string; setup?: string }> }) {
  const { tenant, user } = await requireStaff();
  const sp = await searchParams;
  const s = tenant.settings;
  const owner = user.role === "owner";
  const legal = await listLegalAcceptances(tenant.id, 3);
  const aiLimit = await planDesignLimit(tenant);
  const aiRate = (await db.query.usageRates.findFirst({ where: eq(schema.usageRates.kind, "ai_card_design") }))?.priceAed ?? 0;
  const proto = env.appUrl.startsWith("https") ? "https" : "http";
  const subdomainUrl = `${proto}://${tenant.slug}.${env.rootDomain}`;
  return (
    <div className="space-y-6">
      <PageHeader title="Store settings" subtitle="Branding, legal details for tax invoices, and storefront content." />
      <Flash sp={sp} />
      {!owner && <Alert tone="yellow">Only the store owner can edit these settings.</Alert>}
      <form action={saveStoreSettings} className="space-y-6">
        <fieldset disabled={!owner} className="space-y-6">
          <Card>
            <CardHeader title="Business & tax" subtitle="Printed on every tax invoice. UAE VAT-registered businesses must show their 15-digit TRN." />
            <div className="grid gap-4 p-5 md:grid-cols-2">
              <Field label="Store name"><Input name="name" defaultValue={tenant.name} required /></Field>
              <Field label="Legal (trade licence) name"><Input name="legalName" defaultValue={tenant.legalName ?? ""} /></Field>
              <Field label="TRN (VAT number)"><Input name="trn" defaultValue={tenant.trn ?? ""} inputMode="numeric" maxLength={15} placeholder="100XXXXXXXXXXX3" /></Field>
              <Field label="Invoice / order prefix"><Input name="orderPrefix" defaultValue={s.orderPrefix} maxLength={6} /></Field>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="pricesIncludeVat" defaultChecked={s.pricesIncludeVat} />My product prices already include 5% VAT</label>
            </div>
          </Card>
          <Card>
            <CardHeader title="Contact & location" />
            <div className="grid gap-4 p-5 md:grid-cols-2">
              <Field label="Email"><Input type="email" name="email" defaultValue={tenant.email ?? ""} /></Field>
              <Field label="Phone"><Input name="phone" defaultValue={tenant.phone ?? ""} placeholder="+971 4 …" /></Field>
              <Field label="WhatsApp number"><Input name="whatsapp" defaultValue={tenant.whatsapp ?? ""} placeholder="+971 50 …" /></Field>
              <Field label="Emirate"><Select name="emirate" defaultValue={tenant.emirate}>{EMIRATES.map((e) => <option key={e}>{e}</option>)}</Select></Field>
              <Field label="Area / neighbourhood" hint="(shown in the Live stores directory)">
                <Input name="area" list="area-options" defaultValue={tenant.area ?? ""} placeholder="e.g. Al Barsha" maxLength={60} />
                <datalist id="area-options">{[...new Set(Object.values(AREAS).flat())].sort().map((a) => <option key={a} value={a} />)}</datalist>
              </Field>
              <label className="flex items-center gap-2 self-end pb-2 text-sm" data-testid="directory-toggle"><input type="checkbox" name="directoryListed" defaultChecked={tenant.directoryListed} />List my shop in the public Live stores directory</label>
              <div className="md:col-span-2"><Field label="Address"><Input name="address" defaultValue={tenant.address ?? ""} /></Field></div>
            </div>
          </Card>
          <Card>
            <CardHeader title="Branding & storefront" />
            <div className="grid gap-4 p-5 md:grid-cols-2">
              <Field label="Logo URL"><Input name="logoUrl" defaultValue={tenant.logoUrl ?? ""} placeholder="https://…/logo.png" /></Field>
              <Field label="Brand colour"><div className="flex gap-2"><input type="color" aria-label="Brand colour" name="primaryColor" defaultValue={tenant.primaryColor} className="h-10 w-14 rounded border" /><span className="self-center text-sm text-on-surface-variant">Used for buttons and highlights</span></div></Field>
              <Field label="Homepage headline"><Input name="heroTitle" defaultValue={s.heroTitle ?? ""} /></Field>
              <Field label="Homepage sub-headline"><Input name="heroSubtitle" defaultValue={s.heroSubtitle ?? ""} /></Field>
              <div className="md:col-span-2"><Field label="Announcement bar" hint="e.g. Eid holiday hours"><Textarea name="announcement" rows={2} defaultValue={s.announcement ?? ""} /></Field></div>
              <div>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="aiDesignerEnabled" defaultChecked={s.aiDesignerEnabled} />Show the AI business card designer</label>
                <p className="mt-1 text-xs text-on-surface-variant" data-testid="ai-billing-note">Each customer can create {aiLimit} AI designs a month on your plan. Every AI design is billed to your monthly invoice{aiRate > 0 ? ` (AED ${aiRate} each)` : ""} whether or not the customer checks out. Templates and the editor are free.</p>
              </div>
            </div>
          </Card>
          <Card>
            <CardHeader title="Privacy" />
            <div className="grid gap-4 p-5 md:grid-cols-2">
              <Field label="Delete confidential files after (hours)" hint="counted from delivery / pickup"><Input type="number" min={1} max={720} name="confidentialRetentionHours" defaultValue={s.confidentialRetentionHours} /></Field>
              <p className="self-end text-sm text-on-surface-variant">Confidential uploads are encrypted at rest, every staff download is logged, and files are deleted permanently after this period.</p>
            </div>
          </Card>
          <Card>
            <CardHeader title="Domain" />
            <div className="grid gap-4 p-5 md:grid-cols-2">
              <div>
                <p className="text-sm font-medium text-on-surface-variant">Your free store address</p>
                <a className="text-sm text-primary" target="_blank" href={subdomainUrl}>{subdomainUrl}</a>
                <p className="mt-1 text-xs text-on-surface-variant">Also available at {env.appUrl}/s/{tenant.slug}</p>
              </div>
              <Field label="Custom domain"><Input name="customDomain" defaultValue={tenant.customDomain ?? ""} placeholder="print.yourshop.ae" /></Field>
              <div className="text-sm text-on-surface-variant md:col-span-2">
                To connect a custom domain, add a DNS record at your domain registrar: <code className="rounded bg-surface-container px-1">CNAME {tenant.customDomain || "print.yourshop.ae"} → {env.rootDomain.split(":")[0]}</code>. SSL is issued automatically after DNS propagates, which can take up to 24 hours.
              </div>
            </div>
          </Card>
          <Button>Save settings</Button>
        </fieldset>
      </form>
      <p className="text-sm text-on-surface-variant" data-testid="legal-history">
        Legal terms: {legal.length ? <>accepted version {legal[0].version} on {fmtDateTime(legal[0].acceptedAt)}{legal.length > 1 && <> ({legal.length - 1} earlier)</>}{needsReaccept(legal[0]) && <> (current version is {LEGAL_VERSION})</>}</> : "no acceptance on record"}.{" "}
        {LEGAL_KEYS.map((k, i) => <span key={k}>{i > 0 && " · "}<a href={LEGAL_PATHS[k]} target="_blank" rel="noopener noreferrer" className="underline">{k}</a></span>)}
      </p>
      {owner && <TwoFactorPanel started={sp.setup === "1"} />}
    </div>
  );
}
