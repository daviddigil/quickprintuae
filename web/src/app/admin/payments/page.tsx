import { requireStaff } from "@/lib/auth";
import { decrypt, mask } from "@/lib/crypto";
import { env } from "@/lib/env";
import { Alert, Badge, Button, Card, CardHeader, Field, Input } from "@/components/ui";
import { PageHeader } from "@/components/admin/PageHeader";
import { Flash } from "@/components/admin/Flash";
import { TestConnection } from "@/components/admin/TestConnection";
import { savePayments } from "../actions";

export const metadata = { title: "Payments" };
const m = (enc?: string) => { try { return enc ? mask(decrypt(enc)) : ""; } catch { return "••••"; } };

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { tenant, user } = await requireStaff();
  const sp = await searchParams;
  const p = tenant.settings.payments ?? {};
  const owner = user.role === "owner";
  const stripeHook = `${env.appUrl}/api/webhooks/stripe/${tenant.id}`;
  const mamoHook = `${env.appUrl}/api/webhooks/mamo/${tenant.id}`;
  return (
    <div className="space-y-6">
      <PageHeader title="Payments" subtitle="Customers pay online with card, Apple Pay or Google Pay. Money settles directly into your own account." />
      <Flash sp={sp} />
      <Alert tone="blue">Cash on delivery is not supported. Orders go to production only after online payment succeeds.</Alert>
      {!owner && <Alert tone="yellow">Only the store owner can change payment settings.</Alert>}
      {!p.stripe?.enabled && !p.mamo?.enabled && <Alert tone="yellow">No payment method is active yet. Customers can&apos;t check out until you enable Stripe or Mamo Pay.</Alert>}

      <Card>
        <CardHeader title={<span className="flex items-center gap-2">Stripe {p.stripe?.enabled ? <Badge tone="green">Active</Badge> : <Badge>Off</Badge>}</span>}
          subtitle="Cards, Apple Pay, Google Pay. Get keys at dashboard.stripe.com → Developers → API keys." />
        <form action={savePayments} className="grid gap-4 p-5 md:grid-cols-2">
          <input type="hidden" name="provider" value="stripe" />
          <Field label="Publishable key"><Input name="publishableKey" defaultValue={p.stripe?.publishableKey ?? ""} placeholder="pk_live_…" disabled={!owner} /></Field>
          <Field label="Secret key" hint={p.stripe?.secretKeyEnc ? `saved: ${m(p.stripe.secretKeyEnc)}` : undefined}><Input name="secretKey" type="password" autoComplete="off" placeholder={p.stripe?.secretKeyEnc ? "Leave empty to keep" : "sk_live_…"} disabled={!owner} /></Field>
          <Field label="Webhook signing secret" hint={p.stripe?.webhookSecretEnc ? `saved: ${m(p.stripe.webhookSecretEnc)}` : undefined}><Input name="webhookSecret" type="password" autoComplete="off" placeholder={p.stripe?.webhookSecretEnc ? "Leave empty to keep" : "whsec_…"} disabled={!owner} /></Field>
          <Field label="Webhook URL" hint="add in Stripe → Webhooks, event checkout.session.completed"><Input readOnly value={stripeHook} className="bg-slate-50 font-mono text-xs" /></Field>
          <div className="flex flex-wrap items-center gap-4 md:col-span-2">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="enabled" defaultChecked={p.stripe?.enabled} disabled={!owner} />Enable Stripe at checkout</label>
            <Button disabled={!owner}>Save Stripe</Button>
            {owner && <TestConnection provider="stripe" keyField="secretKey" />}
          </div>
        </form>
      </Card>

      <Card>
        <CardHeader title={<span className="flex items-center gap-2">Mamo Pay {p.mamo?.enabled ? <Badge tone="green">Active</Badge> : <Badge>Off</Badge>}</span>}
          subtitle="UAE payment links: cards, Apple Pay, Google Pay. Get an API key in the Mamo dashboard → Developer." />
        <form action={savePayments} className="grid gap-4 p-5 md:grid-cols-2">
          <input type="hidden" name="provider" value="mamo" />
          <Field label="API key" hint={p.mamo?.apiKeyEnc ? `saved: ${m(p.mamo.apiKeyEnc)}` : undefined}><Input name="apiKey" type="password" autoComplete="off" placeholder={p.mamo?.apiKeyEnc ? "Leave empty to keep" : "sk-…"} disabled={!owner} /></Field>
          <Field label="Webhook secret (optional)" hint={p.mamo?.webhookSecretEnc ? `saved: ${m(p.mamo.webhookSecretEnc)}` : undefined}><Input name="webhookSecret" type="password" autoComplete="off" disabled={!owner} /></Field>
          <div className="md:col-span-2"><Field label="Webhook URL" hint="register in Mamo → Developer → Webhooks (charge.succeeded)"><Input readOnly value={mamoHook} className="bg-slate-50 font-mono text-xs" /></Field></div>
          <div className="flex flex-wrap items-center gap-4 md:col-span-2">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="sandbox" defaultChecked={p.mamo?.sandbox ?? true} disabled={!owner} />Sandbox mode</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="enabled" defaultChecked={p.mamo?.enabled} disabled={!owner} />Enable Mamo Pay at checkout</label>
            <Button disabled={!owner}>Save Mamo Pay</Button>
            {owner && <TestConnection provider="mamo" keyField="apiKey" />}
          </div>
        </form>
      </Card>
    </div>
  );
}
