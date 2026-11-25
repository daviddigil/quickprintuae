"use client";
import { Badge, Card, CardHeader } from "@/components/ui";

export interface SetupStatus {
  webhookUrl: string; subscribeFields: string[];
  checks: { metaApp: boolean; verifyToken: boolean; signupConfig: boolean; platformReady: boolean; embeddedSignupReady: boolean; ai: "claude" | "rule-based"; fakeMode: boolean; graphHost: string; graphVersion: string; connected: boolean };
}

function Row({ id, ok, label, hint, warn }: { id: string; ok: boolean; label: string; hint?: string; warn?: boolean }) {
  return (
    <li className="flex items-start justify-between gap-4 px-5 py-3 text-sm" data-testid={`wa-check-${id}`} data-ok={ok}>
      <div><p className="font-medium">{label}</p>{hint && <p className="text-xs text-slate-500">{hint}</p>}</div>
      <Badge tone={ok ? "green" : warn ? "yellow" : "red"}>{ok ? "OK" : warn ? "Optional" : "Needs setup"}</Badge>
    </li>
  );
}

/** Plain-language checklist of what is configured, so an owner (or the platform admin) can see exactly what's missing. */
export function WhatsappSetupStatus({ s }: { s: SetupStatus }) {
  const c = s.checks;
  return (
    <Card data-testid="wa-setup">
      <CardHeader title="Setup status" subtitle="Everything WhatsApp needs, at a glance." />
      <ul className="divide-y divide-slate-100">
        <Row id="ai" ok label={c.ai === "claude" ? "AI replies: Claude" : "AI replies: built-in rule-based assistant"} warn hint={c.ai === "claude" ? "Claude answers customers, builds carts and quotes with your real prices." : "No ANTHROPIC_API_KEY on the server, so a simpler built-in assistant answers (menu, quotes, cart, checkout). Add the key for full AI."} />
        <Row id="metaApp" ok={c.metaApp} label="Platform Meta app (for 'Connect with Facebook')" hint="Platform admin: set META_APP_ID and META_APP_SECRET. Shops can skip this by connecting their own Meta app (Manual connect)." warn />
        <Row id="verifyToken" ok={c.verifyToken} label="Webhook verify token" hint="Platform admin: set META_VERIFY_TOKEN, then use it in the Meta app's webhook settings." warn />
        <Row id="signupConfig" ok={c.signupConfig} label="Embedded Signup configuration (coexistence)" hint="Platform admin: set META_EMBEDDED_SIGNUP_CONFIG_ID from Meta's Facebook Login for Business." warn />
        <Row id="connected" ok={c.connected} label="Your WhatsApp number" hint={c.connected ? "Connected." : "Connect below, or try the AI in the test chat first."} />
      </ul>
      <div className="space-y-1 border-t border-slate-100 px-5 py-4 text-xs text-slate-600">
        <p>Webhook callback URL: <code className="rounded bg-slate-100 px-1.5 py-0.5" data-testid="wa-webhook-url">{s.webhookUrl}</code></p>
        <p>Subscribe to these webhook fields: {s.subscribeFields.map((f) => <code key={f} className="mr-1 rounded bg-slate-100 px-1.5 py-0.5">{f}</code>)} <span className="text-slate-400">(smb_message_echoes lets the AI pause when you reply from your phone)</span></p>
        <p>Meta Graph API: {c.graphHost} · {c.graphVersion}{c.fakeMode ? " · TEST MODE: messages are recorded, not sent" : ""}</p>
      </div>
    </Card>
  );
}
