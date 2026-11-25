"use client";
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Circle, Copy, KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { Alert, Badge, Button, Card, CardHeader, Field, Input } from "@/components/ui";

interface Cfg { appId: string; signupConfigId: string; businessId: string; graphVersion: string; hasAppSecret: boolean; appSecretMask: string | null; hasVerifyToken: boolean; verifyTokenMask: string | null; sources: Record<string, "db" | "env" | "none">; platformReady: boolean; embeddedSignupReady: boolean; graphHost: string; lastTestAt: string | null; lastTestOk: boolean | null; lastTestMessage: string | null }
interface Req { tenantId: string; shop: string; slug: string; createdAt: string; notifiedAt: string | null }
interface View { config: Cfg; webhookUrl: string; subscribeFields: string[]; appDomain: string; requests: Req[]; waiting: number }

async function api<T>(url: string, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error ?? "Request failed");
  return j as T;
}
const rand = () => { const b = new Uint8Array(24); crypto.getRandomValues(b); return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };

function Check({ ok, label, source, hint }: { ok: boolean; label: string; source?: string; hint: string }) {
  return (
    <li data-ok={ok ? "true" : "false"} className="flex items-start gap-3 px-5 py-3 text-sm">
      {ok ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" aria-hidden /> : <Circle className="mt-0.5 h-5 w-5 shrink-0 text-outline" aria-hidden />}
      <div className="min-w-0 flex-1"><p className="font-medium">{label}</p><p className="text-xs text-on-surface-variant">{ok ? "Configured" : hint}</p></div>
      {ok && source && source !== "none" && <Badge tone={source === "db" ? "green" : "blue"}>{source === "db" ? "saved here" : "from server env"}</Badge>}
    </li>
  );
}

export function MetaTechProviderForm() {
  const [v, setV] = useState<View | null>(null);
  const [form, setForm] = useState({ appId: "", configId: "", businessId: "", graphVersion: "v21.0", appSecret: "", verifyToken: "" });
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "green" | "red" | "blue"; text: string } | null>(null);

  const load = useCallback(async () => {
    const d = await api<View>("/api/v1/superadmin/whatsapp");
    setV(d);
    setForm((f) => ({ ...f, appId: d.config.appId, configId: d.config.signupConfigId, businessId: d.config.businessId, graphVersion: d.config.graphVersion, appSecret: "", verifyToken: "" }));
  }, []);
  useEffect(() => { load().catch((e) => setMsg({ tone: "red", text: e.message })); }, [load]);

  const run = async (name: string, fn: () => Promise<void>) => { setBusy(name); setMsg(null); try { await fn(); } catch (e) { setMsg({ tone: "red", text: (e as Error).message }); } setBusy(null); };

  const save = () => run("save", async () => {
    const body: Record<string, string> = { appId: form.appId, configId: form.configId, businessId: form.businessId, graphVersion: form.graphVersion };
    if (form.appSecret) body.appSecret = form.appSecret;
    if (form.verifyToken) body.verifyToken = form.verifyToken;
    const d = await api<View>("/api/v1/superadmin/whatsapp", "PUT", body);
    setV(d); setForm((f) => ({ ...f, appSecret: "", verifyToken: "" }));
    setMsg({ tone: "green", text: d.config.embeddedSignupReady ? "Saved. One-click “Connect WhatsApp” is now LIVE for every shop owner — no restart needed." : "Saved. Add the missing items below to switch one-click connect on." });
  });
  const test = () => run("test", async () => {
    const r = await api<{ ok: boolean; message: string }>("/api/v1/superadmin/whatsapp/test", "POST", { appId: form.appId || undefined, appSecret: form.appSecret || undefined });
    setMsg({ tone: r.ok ? "green" : "red", text: r.message }); if (!form.appSecret) await load();
  });
  const remove = () => confirm("Remove the saved Meta credentials? One-click connect switches off (server env variables, if set, become the fallback).") && run("remove", async () => { setV(await api<View>("/api/v1/superadmin/whatsapp", "DELETE")); await load(); setMsg({ tone: "blue", text: "Saved credentials removed." }); });
  const mark = (r: Req) => run("mark" + r.tenantId, async () => { await api("/api/v1/superadmin/whatsapp/requests", "PATCH", { tenantId: r.tenantId, notified: !r.notifiedAt }); await load(); });
  const copy = (t: string) => navigator.clipboard?.writeText(t).then(() => setMsg({ tone: "blue", text: "Copied." })).catch(() => {});

  if (!v) return <p className="text-sm text-on-surface-variant" aria-busy="true">Loading…</p>;
  const c = v.config;
  return (
    <div className="space-y-6">
      <div role="status" aria-live="polite" className={`flex items-center gap-3 rounded-xl border px-5 py-4 ${c.embeddedSignupReady ? "border-success/50 bg-success-container text-success" : "border-warning/50 bg-warning-container text-on-warning-container"}`} data-testid="sa-wa-state">
        <ShieldCheck className="h-6 w-6 shrink-0" aria-hidden />
        <div><p className="font-semibold">{c.embeddedSignupReady ? "One-click WhatsApp connect is LIVE" : "One-click WhatsApp connect is not active yet"}</p>
          <p className="text-sm opacity-90">{c.embeddedSignupReady ? "Shop owners see the Embedded Signup popup when they tap Connect WhatsApp." : "Owners can still tap the button: they see an “activation pending” message and can ask to be notified. Add your Tech Provider credentials below to switch it on."}</p></div>
      </div>

      {msg && <Alert tone={msg.tone} >{msg.text}</Alert>}

      <Card>
        <CardHeader title="Readiness" subtitle="Everything one-click connect needs, at a glance." />
        <ul className="divide-y divide-outline-variant" data-testid="sa-wa-checklist">
          <Check ok={!!c.appId} label="Meta App ID" source={c.sources.appId} hint="Meta for Developers → your app → App settings → Basic" />
          <Check ok={c.hasAppSecret} label="Meta App Secret" source={c.sources.appSecret} hint="Same page → App secret → Show. Verifies webhooks and exchanges sign-up codes." />
          <Check ok={c.hasVerifyToken} label="Webhook verify token" source={c.sources.verifyToken} hint="Any random string — press Generate. Paste the same value in the Meta webhook settings." />
          <Check ok={!!c.signupConfigId} label="Embedded Signup configuration ID" source={c.sources.signupConfigId} hint="Facebook Login for Business → Configurations → create one for WhatsApp Embedded Signup (include the WhatsApp Business app / coexistence option)." />
        </ul>
      </Card>

      <Card>
        <CardHeader title="Tech Provider credentials" subtitle="Saved encrypted in the database. The secret is write-only — it is never shown again." />
        <form className="grid gap-4 p-5 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save(); }} data-testid="sa-wa-form">
          <Field label="App ID"><Input value={form.appId} onChange={(e) => setForm({ ...form, appId: e.target.value })} inputMode="numeric" placeholder="1234567890123456" data-testid="sa-wa-appid" /></Field>
          <Field label="Embedded Signup configuration ID"><Input value={form.configId} onChange={(e) => setForm({ ...form, configId: e.target.value })} inputMode="numeric" placeholder="1234567890123456" data-testid="sa-wa-configid" /></Field>
          <Field label="App Secret" hint={c.hasAppSecret ? `(saved ${c.appSecretMask} — leave empty to keep)` : ""}>
            <Input type="password" value={form.appSecret} onChange={(e) => setForm({ ...form, appSecret: e.target.value })} autoComplete="off" placeholder={c.hasAppSecret ? "••••••••••••" : "paste your app secret"} data-testid="sa-wa-secret" />
          </Field>
          <Field label="Webhook verify token" hint={c.hasVerifyToken ? `(saved ${c.verifyTokenMask} — leave empty to keep)` : ""}>
            <div className="flex gap-2"><Input value={form.verifyToken} onChange={(e) => setForm({ ...form, verifyToken: e.target.value })} autoComplete="off" placeholder={c.hasVerifyToken ? "••••••••" : "press Generate"} data-testid="sa-wa-verify" />
              <Button type="button" variant="secondary" onClick={() => setForm({ ...form, verifyToken: rand() })}><KeyRound className="h-4 w-4" />Generate</Button></div>
          </Field>
          <Field label="Business ID" hint="(optional)"><Input value={form.businessId} onChange={(e) => setForm({ ...form, businessId: e.target.value })} inputMode="numeric" placeholder="optional" /></Field>
          <Field label="Graph API version"><Input value={form.graphVersion} onChange={(e) => setForm({ ...form, graphVersion: e.target.value })} placeholder="v21.0" /></Field>
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <Button disabled={!!busy} data-testid="sa-wa-save">{busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Save credentials</Button>
            <Button type="button" variant="secondary" disabled={!!busy} onClick={test} data-testid="sa-wa-test">{busy === "test" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Test credentials</Button>
            {(c.sources.appId === "db" || c.sources.appSecret === "db") && <Button type="button" variant="ghost" className="text-critical" disabled={!!busy} onClick={remove}>Remove saved credentials</Button>}
          </div>
          {c.lastTestAt && <p className="text-xs text-on-surface-variant sm:col-span-2">Last test: {new Date(c.lastTestAt).toLocaleString("en-AE")} — {c.lastTestOk ? "passed" : "failed"}{c.lastTestMessage ? ` (${c.lastTestMessage})` : ""}</p>}
        </form>
      </Card>

      <Card>
        <CardHeader title="Set up in your Meta app" subtitle="Paste these into Meta for Developers (WhatsApp → Configuration)." />
        <dl className="space-y-3 p-5 text-sm">
          <div><dt className="text-on-surface-variant">Webhook callback URL</dt><dd className="flex items-center gap-2"><code className="break-all rounded bg-surface-container px-2 py-1 text-xs" data-testid="sa-wa-webhook">{v.webhookUrl}</code><button type="button" aria-label="Copy callback URL" className="text-on-surface-variant hover:text-on-surface" onClick={() => copy(v.webhookUrl)}><Copy className="h-4 w-4" /></button></dd></div>
          <div><dt className="text-on-surface-variant">Subscribe to these webhook fields</dt><dd className="flex flex-wrap gap-2">{v.subscribeFields.map((f) => <code key={f} className="rounded bg-surface-container px-2 py-1 text-xs">{f}</code>)}<span className="text-xs text-outline">(smb_message_echoes lets the AI pause when an owner replies from the WhatsApp Business app)</span></dd></div>
          <div><dt className="text-on-surface-variant">Allowed domain / JS SDK origin / Valid OAuth redirect host</dt><dd><code className="rounded bg-surface-container px-2 py-1 text-xs">{v.appDomain}</code></dd></div>
          <p className="text-xs text-on-surface-variant">Graph API host in use: <code>{c.graphHost}</code> · version <code>{c.graphVersion}</code></p>
        </dl>
      </Card>

      <Card>
        <CardHeader title={`Shops waiting for one-click connect (${v.waiting})`} subtitle="Owners who tapped “Notify me” while it was not active yet." />
        {v.requests.length === 0 ? <p className="px-5 py-6 text-sm text-on-surface-variant">No requests yet.</p> : (
          <ul className="divide-y divide-outline-variant" data-testid="sa-wa-requests">
            {v.requests.map((r) => (
              <li key={r.tenantId} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                <div><p className="font-medium">{r.shop} <span className="font-normal text-outline">/s/{r.slug}</span></p><p className="text-xs text-on-surface-variant">Asked {new Date(r.createdAt).toLocaleDateString("en-AE")}</p></div>
                <div className="flex items-center gap-2">{r.notifiedAt ? <Badge tone="green">Notified</Badge> : <Badge tone="yellow">Waiting</Badge>}<Button variant="ghost" onClick={() => mark(r)} disabled={!!busy}>{r.notifiedAt ? "Undo" : "Mark notified"}</Button></div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
