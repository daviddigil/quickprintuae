import { CheckCircle2, Circle } from "lucide-react";
import { requireSuperadmin } from "@/lib/auth";
import { Alert, Badge, Button, Card, CardHeader, Field, Input } from "@/components/ui";
import { PageTitle, fmtDateTime } from "@/components/platform/PageTitle";
import { Flash } from "@/components/admin/Flash";
import { PROVIDERS, STRIPE_EVENTS, gatewayView } from "@/server/payments/gateway-admin";
import { retireLegacyGateways } from "@/server/payments/platform";
import { saveGatewayAction } from "./actions";
import { CopyButton, GatewayTest } from "./GatewayTest";

export const dynamic = "force-dynamic";
export const metadata = { title: "Payment gateways" };

export default async function GatewaysPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  await requireSuperadmin();
  const sp = await searchParams;
  await retireLegacyGateways();
  const p = PROVIDERS[0];
  const v = await gatewayView(p.code);
  const live = v.enabled && !!v.secretMask;
  const keyed = !!v.secretMask, hook = !!v.webhookMask;
  return (
    <div className="space-y-6">
      <PageTitle title="Stripe payments" subtitle="QuickPrint takes every payment through Stripe: customer orders, shop subscriptions and the card kept on file at signup. Keys live only here; shops never see or hold them." />
      <Flash sp={sp} />
      <div role="status" data-testid="gateway-state" className={`rounded-shape-lg border px-5 py-4 text-sm ${live ? "border-success/50 bg-success-container text-on-success-container" : "border-warning/50 bg-warning-container text-on-warning-container"}`}>
        {live ? <p><strong>Live payments are on via Stripe{v.sandbox ? " in TEST mode" : ""}.</strong> {v.sandbox ? "Test mode moves no real money: use Stripe test cards only." : "Real cards are charged."}</p>
          : <p><strong>Stripe is not enabled.</strong> {v.fake ? "Fake mode (PAYMENTS_FAKE=1) is on, so checkout and signup are simulated." : "Customers cannot pay and new shops cannot add a card until Stripe is configured and enabled. Simulated payments are only used when PAYMENTS_FAKE=1 or the server runs in development."}</p>}
      </div>
      <ul className="flex flex-wrap gap-2" aria-label="Stripe readiness" data-testid="gateway-chips">
        <li><Badge tone={keyed ? "green" : "yellow"} dot>{keyed ? "Secret key saved" : "No secret key"}</Badge></li>
        <li><Badge tone={hook ? "green" : "yellow"} dot>{hook ? "Webhook secret saved" : "No webhook secret"}</Badge></li>
        <li><Badge tone={v.sandbox ? "yellow" : "blue"} dot>{v.sandbox ? "Test mode" : "Live mode"}</Badge></li>
        <li><Badge tone={v.enabled ? "green" : "gray"} dot>{v.enabled ? "Enabled" : "Off"}</Badge></li>
      </ul>
      <Card data-testid={`gateway-${p.code}`}>
        <CardHeader title={<span className="flex flex-wrap items-center gap-2">{p.name} {v.enabled ? <Badge tone="green" dot>Enabled</Badge> : <Badge>Off</Badge>} <Badge tone={v.sandbox ? "yellow" : "blue"}>{v.sandbox ? "Sandbox" : "Live"}</Badge>{v.source === "env" && <Badge tone="blue">from server env</Badge>}</span>} subtitle={p.blurb} />
        <div className="grid gap-6 p-5 lg:grid-cols-[1fr_22rem]">
          <form action={saveGatewayAction} className="grid gap-4 md:grid-cols-2">
            <input type="hidden" name="provider" value={p.code} />
            <Field label="Secret key" hint={v.secretMask ? `saved ${v.secretMask}` : undefined}>
              <Input name="secretKey" type="password" autoComplete="off" spellCheck={false} placeholder={v.secretMask ? "Leave empty to keep the saved key" : "sk_live_…"} />
            </Field>
            <Field label="Webhook signing secret" hint={v.webhookMask ? `saved ${v.webhookMask}` : undefined}>
              <Input name="webhookSecret" type="password" autoComplete="off" spellCheck={false} placeholder={v.webhookMask ? "Leave empty to keep" : "whsec_…"} />
            </Field>
            <Field label="Publishable key" hint="not secret"><Input name="publishableKey" defaultValue={v.publishableKey ?? ""} autoComplete="off" placeholder="pk_live_…" /></Field>
            <Field label="Hold days before payout" hint="refund cover"><Input name="payoutHoldDays" type="number" min={0} max={60} defaultValue={v.payoutHoldDays} /></Field>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 md:col-span-2">
              <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="sandbox" defaultChecked={v.sandbox} className="h-5 w-5" />Test mode (sk_test_ keys)</label>
              <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="enabled" defaultChecked={v.enabled} className="h-5 w-5" />Enabled at checkout</label>
              <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="recipientPaysFees" defaultChecked={v.recipientPaysFees} className="h-5 w-5" />Shop pays the gateway fee</label>
            </div>
            <p className="rounded-shape-md border border-warning/40 bg-warning-container px-3 py-2 text-xs text-on-warning-container md:col-span-2">Test and live are separate worlds in Stripe: keys, the webhook endpoint and its signing secret must all come from the same mode. Switch to live only with sk_live_ and pk_live_ keys and a live-mode webhook.</p>
            <div className="flex flex-wrap items-center gap-4 md:col-span-2">
              <Button data-testid={`save-${p.code}`}>Save Stripe</Button>
              <GatewayTest provider={p.code} />
            </div>
            {v.lastTestAt && <p className="text-xs text-on-surface-variant md:col-span-2">Last saved-key test: {v.lastTestOk ? "passed" : "failed"} on {fmtDateTime(v.lastTestAt)}</p>}
          </form>
          <aside aria-label="Stripe setup" className="space-y-5">
            <div>
              <h2 className="mb-2 text-sm font-semibold">Readiness</h2>
              <ul className="space-y-2" data-testid={`checklist-${p.code}`}>
                {v.checks.map((c) => (
                  <li key={c.key} data-ok={c.ok ? "true" : "false"} className="flex items-start gap-2 text-sm">
                    {c.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-outline" aria-hidden />}
                    <span><span className="font-medium">{c.label}</span>{!c.ok && <span className="block text-xs text-on-surface-variant">{c.hint}</span>}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h2 className="mb-1 text-sm font-semibold">1. Webhook URL</h2>
              <p className="mb-2 break-all rounded-shape-md bg-surface-low px-3 py-2 font-mono text-xs" data-testid={`webhook-url-${p.code}`}>{v.webhookUrl}</p>
              <CopyButton text={v.webhookUrl} label="Copy Stripe webhook URL" />
              <p className="mt-2 text-xs text-on-surface-variant">In Stripe: Developers, Webhooks, Add endpoint. Paste this URL, then copy the signing secret (whsec_…) back into the form.</p>
            </div>
            <div>
              <h2 className="mb-1 text-sm font-semibold">2. Events to subscribe</h2>
              <ul className="space-y-1 font-mono text-xs" data-testid="stripe-events">{STRIPE_EVENTS.map((e) => <li key={e}>{e}</li>)}</ul>
            </div>
          </aside>
        </div>
      </Card>
      <Alert tone="blue">Secrets are encrypted at rest and shown only as their last four characters. Every change here is written to the audit log. Simulated (fake) payments are used only when PAYMENTS_FAKE=1 or the server runs in development.</Alert>
    </div>
  );
}
