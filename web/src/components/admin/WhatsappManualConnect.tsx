"use client";
import { useState } from "react";
import { Alert, Button, Field, Input } from "@/components/ui";

/** Bring-your-own Meta app: WABA ID + Phone Number ID + permanent token + app secret. Shown inline; the token is never displayed again. */
export function WhatsappManualConnect({ onConnected }: { onConnected: (r: { webhookUrl: string; verifyToken: string | null }) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setErr(null);
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/v1/admin/whatsapp/connect/manual", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ wabaId: fd.get("wabaId"), phoneNumberId: fd.get("phoneNumberId"), accessToken: fd.get("accessToken"), appSecret: fd.get("appSecret") }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setErr(j.error ?? "Could not connect");
    onConnected({ webhookUrl: j.webhookUrl, verifyToken: j.account?.verifyToken ?? null });
  }

  return (
    <form onSubmit={submit} className="space-y-3" data-testid="wa-manual-form" autoComplete="off">
      {err && <Alert>{err}</Alert>}
      <p className="text-xs text-slate-500">Use this if you already have your own Meta app (developers.facebook.com → WhatsApp → API Setup). The access token should be a permanent <b>System User</b> token with whatsapp_business_messaging and whatsapp_business_management.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="WhatsApp Business Account ID"><Input name="wabaId" required inputMode="numeric" placeholder="e.g. 104996122399160" /></Field>
        <Field label="Phone number ID"><Input name="phoneNumberId" required inputMode="numeric" placeholder="e.g. 106540352242922" /></Field>
        <Field label="Permanent access token"><Input name="accessToken" type="password" required minLength={20} placeholder="EAAG…" /></Field>
        <Field label="App secret" hint="(verifies messages really come from Meta)"><Input name="appSecret" type="password" required minLength={8} /></Field>
      </div>
      <Button disabled={busy} data-testid="wa-manual-submit">{busy ? "Verifying with Meta…" : "Verify & connect"}</Button>
    </form>
  );
}
