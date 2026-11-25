"use client";
import { Badge, Card, CardHeader } from "@/components/ui";

export interface SetupStatus {
  webhookUrl: string; subscribeFields: string[];
  /** one-click connect availability (set by the platform admin) — drives the Connect button */
  platform: { ready: boolean; appId: string | null; configId: string | null; graphVersion: string };
  activationRequested: boolean;
  checks: { metaApp: boolean; verifyToken: boolean; signupConfig: boolean; platformReady: boolean; embeddedSignupReady: boolean; ai: "claude" | "rule-based"; fakeMode: boolean; graphHost: string; graphVersion: string; connected: boolean };
}

function Row({ id, ok, label, hint, warn }: { id: string; ok: boolean; label: string; hint?: string; warn?: boolean }) {
  return (
    <li className="flex items-start justify-between gap-4 px-5 py-3 text-sm" data-testid={`wa-check-${id}`} data-ok={ok}>
      <div><p className="font-medium">{label}</p>{hint && <p className="text-xs text-slate-500">{hint}</p>}</div>
      <Badge tone={ok ? "green" : warn ? "yellow" : "gray"}>{ok ? "OK" : warn ? "Optional" : "Not yet"}</Badge>
    </li>
  );
}

/** Owner-friendly "at a glance". Platform/Meta plumbing lives on the superadmin page — owners never see env variables. */
export function WhatsappSetupStatus({ s }: { s: SetupStatus }) {
  const c = s.checks;
  return (
    <Card data-testid="wa-setup">
      <CardHeader title="At a glance" />
      <ul className="divide-y divide-slate-100">
        <Row id="ai" ok warn={c.ai !== "claude"} label={c.ai === "claude" ? "AI replies: Claude" : "AI replies: built-in assistant"} hint={c.ai === "claude" ? "Understands free-form requests, builds carts and quotes real prices." : "Answers menu, price quotes, cart and checkout questions. Smarter AI replies switch on when the platform adds its AI key."} />
        <Row id="connected" ok={c.connected} label="Your WhatsApp number" hint={c.connected ? "Connected." : "Tap Connect WhatsApp above — or try the AI in the test chat first."} />
      </ul>
      {c.fakeMode && <p className="border-t border-slate-100 px-5 py-3 text-xs text-amber-700">TEST MODE: messages are recorded, not sent to WhatsApp.</p>}
    </Card>
  );
}
