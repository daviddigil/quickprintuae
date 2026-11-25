"use client";
import { useState } from "react";
import { CheckCircle2, Loader2, Send } from "lucide-react";
import { Alert, Button, Input } from "@/components/ui";

/** Shown right after a successful connection: confirms the number, then lets the owner see it work on their own phone. */
export function WhatsappWelcome({ phone, onDismiss, onTryChat }: { phone: string | null; onDismiss: () => void; onTryChat: () => void }) {
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function sendTest(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMsg(null);
    try {
      const res = await fetch("/api/v1/admin/whatsapp/test-message", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ phone: to }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? "Could not send the test message");
      setMsg({ ok: true, text: "Sent! Check WhatsApp on your phone." });
    } catch (err) { setMsg({ ok: false, text: (err as Error).message }); }
    setBusy(false);
  }

  return (
    <section className="rounded-3xl border border-success/50 bg-success-container p-6" data-testid="wa-welcome" aria-live="polite">
      <div className="flex items-start gap-4">
        <CheckCircle2 className="mt-0.5 h-8 w-8 shrink-0 text-success" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-bold" data-testid="wa-welcome-title">Connected{phone ? `: ${phone}` : ""}</h2>
          <p className="mt-1 text-sm text-on-surface-variant">Your AI assistant is on and answering customers. You can still use your WhatsApp Business app as usual — when you reply yourself, the AI pauses.</p>
          <form onSubmit={sendTest} className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Input value={to} onChange={(e) => setTo(e.target.value)} type="tel" inputMode="tel" placeholder="Your personal WhatsApp number, e.g. +971 50 123 4567" aria-label="Your personal WhatsApp number" data-testid="wa-test-phone" className="sm:max-w-sm" />
            <Button disabled={busy || to.trim().length < 6} data-testid="wa-send-test">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Send a test message to my phone</Button>
          </form>
          {msg && <div className="mt-3" data-testid="wa-test-result">{msg.ok ? <p className="text-sm font-semibold text-success">{msg.text}</p> : <Alert>{msg.text}</Alert>}</div>}
          <div className="mt-4 flex flex-wrap gap-4 text-sm">
            <button type="button" className="font-semibold text-success underline underline-offset-2" onClick={onTryChat}>Try the AI in the test chat</button>
            <button type="button" className="text-on-surface-variant underline underline-offset-2" onClick={onDismiss} data-testid="wa-welcome-dismiss">Dismiss</button>
          </div>
        </div>
      </div>
    </section>
  );
}
