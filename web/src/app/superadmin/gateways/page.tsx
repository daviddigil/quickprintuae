import { CheckCircle2, Circle } from "lucide-react";
import { requireSuperadmin } from "@/lib/auth";
import { Alert, Badge, Button, Card, CardHeader, Field, Input } from "@/components/ui";
import { PageTitle, fmtDateTime } from "@/components/platform/PageTitle";
import { Flash } from "@/components/admin/Flash";
import { PROVIDERS, gatewayView } from "@/server/payments/gateway-admin";
import { saveGatewayAction } from "./actions";
import { CopyButton, GatewayTest } from "./GatewayTest";

export const dynamic = "force-dynamic";
export const metadata = { title: "Payment gateways" };

export default async function GatewaysPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  await requireSuperadmin();
  const sp = await searchParams;
  const views = await Promise.all(PROVIDERS.map((p) => gatewayView(p.code)));
  const live = views.filter((v) => v.enabled && v.secretMask);
  return (
    <div className="space-y-6">
      <PageTitle title="Payment gateways" subtitle="The only place gateway keys live. Every customer payment lands in these accounts; shops never see or hold keys." />
      <Flash sp={sp} />
      <div role="status" data-testid="gateway-state" className={`rounded-shape-lg border px-5 py-4 text-sm ${live.length ? "border-success/50 bg-success-container text-on-success-container" : "border-warning/50 bg-warning-container text-on-warning-container"}`}>
        {live.length ? <p><strong>Live payments are on via {live.map((v) => (v.provider === "stripe" ? "Stripe" : "Mamo Pay")).join(" and ")}.</strong> Shops can offer whichever is active.</p>
          : <p><strong>No gateway is enabled.</strong> {views[0].fake ? "Fake mode (PAYMENTS_FAKE=1) is on, so checkout is simulated." : "Customers cannot pay online until one is configured and enabled."}</p>}
      </div>
      {PROVIDERS.map((p, i) => {
        const v = views[i];
        return (
          <Card key={p.code} data-testid={`gateway-${p.code}`}>
            <CardHeader title={<span className="flex flex-wrap items-center gap-2">{p.name} {v.enabled ? <Badge tone="green" dot>Enabled</Badge> : <Badge>Off</Badge>} <Badge tone={v.sandbox ? "yellow" : "blue"}>{v.sandbox ? "Sandbox" : "Live"}</Badge>{v.source === "env" && <Badge tone="blue">from server env</Badge>}</span>} subtitle={p.blurb} />
            <div className="grid gap-6 p-5 lg:grid-cols-[1fr_20rem]">
              <form action={saveGatewayAction} className="grid gap-4 md:grid-cols-2">
                <input type="hidden" name="provider" value={p.code} />
                <Field label={p.code === "stripe" ? "Secret key" : "API key"} hint={v.secretMask ? `saved ${v.secretMask}` : undefined}>
                  <Input name="secretKey" type="password" autoComplete="off" spellCheck={false} placeholder={v.secretMask ? "Leave empty to keep the saved key" : p.code === "stripe" ? "sk_live_…" : "sk-…"} />
                </Field>
                <Field label="Webhook signing secret" hint={v.webhookMask ? `saved ${v.webhookMask}` : undefined}>
                  <Input name="webhookSecret" type="password" autoComplete="off" spellCheck={false} placeholder={v.webhookMask ? "Leave empty to keep" : p.code === "stripe" ? "whsec_…" : "a long random string"} />
                </Field>
                {p.code === "stripe" && <Field label="Publishable key" hint="not secret"><Input name="publishableKey" defaultValue={v.publishableKey ?? ""} autoComplete="off" placeholder="pk_live_…" /></Field>}
                <Field label="Hold days before payout" hint="refund cover"><Input name="payoutHoldDays" type="number" min={0} max={60} defaultValue={v.payoutHoldDays} /></Field>
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 md:col-span-2">
                  <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="sandbox" defaultChecked={v.sandbox} className="h-5 w-5" />Sandbox / test mode</label>
                  <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="enabled" defaultChecked={v.enabled} className="h-5 w-5" />Enabled at checkout</label>
                  <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="recipientPaysFees" defaultChecked={v.recipientPaysFees} className="h-5 w-5" />Shop pays the gateway fee</label>
                </div>
                <div className="flex flex-wrap items-center gap-4 md:col-span-2">
                  <Button data-testid={`save-${p.code}`}>Save {p.name}</Button>
                  <GatewayTest provider={p.code} />
                </div>
                {v.lastTestAt && <p className="text-xs text-on-surface-variant md:col-span-2">Last saved-key test: {v.lastTestOk ? "passed" : "failed"} on {fmtDateTime(v.lastTestAt)}</p>}
              </form>
              <aside aria-label={`${p.name} setup`} className="space-y-4">
                <div>
                  <h4 className="mb-2 text-sm font-semibold">Readiness</h4>
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
                  <h4 className="mb-1 text-sm font-semibold">Webhook URL</h4>
                  <p className="mb-2 break-all rounded-shape-md bg-surface-low px-3 py-2 font-mono text-xs" data-testid={`webhook-url-${p.code}`}>{v.webhookUrl}</p>
                  <CopyButton text={v.webhookUrl} label={`Copy ${p.name} webhook URL`} />
                  <p className="mt-2 text-xs text-on-surface-variant">{p.code === "stripe" ? "Events: checkout.session.completed, payment_intent.succeeded, charge.refunded, charge.dispute.created, charge.dispute.closed, setup_intent.succeeded." : "Events: charge.succeeded, charge.refunded. Set the auth header to your webhook secret."}</p>
                </div>
              </aside>
            </div>
          </Card>
        );
      })}
      <Alert tone="blue">Secrets are encrypted at rest and shown only as their last four characters. Every change here is written to the audit log.</Alert>
    </div>
  );
}
