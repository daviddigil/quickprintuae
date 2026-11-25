"use client";
import { useEffect, useRef, useState } from "react";
import { BellRing, CheckCircle2, Loader2, MessageCircle, X } from "lucide-react";
import { Alert, Button } from "@/components/ui";
import { WhatsappManualConnect } from "./WhatsappManualConnect";

/**
 * Shown when the owner taps "Connect WhatsApp" before the platform's Tech Provider credentials exist.
 * Friendly, never says "coming soon": it explains activation, lets the owner ask to be notified, and keeps the advanced/manual route + test chat reachable.
 */
export function WhatsappActivationSheet({ requested, onRequested, onManualConnected, onClose, onTryChat }: {
  requested: boolean; onRequested: () => void; onManualConnected: (r: { webhookUrl: string; verifyToken: string | null }) => void; onClose: () => void; onTryChat: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(requested);
  const closeRef = useRef<HTMLButtonElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return onClose();
      if (e.key !== "Tab" || !boxRef.current) return;
      const f = [...boxRef.current.querySelectorAll<HTMLElement>('button, [href], input, summary, textarea, select, [tabindex]:not([tabindex="-1"])')].filter((x) => !x.hasAttribute("disabled"));
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; prev?.focus(); };
  }, [onClose]);

  async function notify() {
    setBusy(true); setErr(null);
    try {
      const res = await fetch("/api/v1/admin/whatsapp/activation-request", { method: "POST" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? "Could not save your request");
      setDone(true); onRequested();
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-inverse-surface/50 p-0 backdrop-blur-sm sm:items-center sm:p-6" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }} data-testid="wa-activation-backdrop">
      <div ref={boxRef} role="dialog" aria-modal="true" aria-labelledby="wa-act-title" className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl" data-testid="wa-activation-sheet">
        <div className="flex items-start justify-between gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#25D366] text-[#06301a]" aria-hidden><MessageCircle className="h-6 w-6" /></div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close" className="rounded-full p-2 text-on-surface-variant hover:bg-surface-container"><X className="h-5 w-5" /></button>
        </div>
        <h2 id="wa-act-title" className="mt-4 text-xl font-bold tracking-tight">We&apos;re activating one-click WhatsApp for your account</h2>
        <p className="mt-2 text-sm text-on-surface-variant">As soon as it&apos;s ready, connecting takes a single tap — you sign in, pick your WhatsApp Business number, and your AI assistant starts answering. We&apos;ll let you know.</p>

        {err && <div className="mt-4"><Alert>{err}</Alert></div>}
        <div className="mt-5" aria-live="polite">
          {done ? (
            <p className="flex items-center gap-2 rounded-xl bg-success-container px-4 py-3 text-sm font-semibold text-success" data-testid="wa-on-the-list"><CheckCircle2 className="h-5 w-5" aria-hidden />You&apos;re on the list ✓</p>
          ) : (
            <Button onClick={notify} disabled={busy} className="w-full py-3" data-testid="wa-notify-me">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" />}Notify me when it&apos;s ready</Button>
          )}
        </div>

        <div className="mt-6 space-y-3 border-t border-outline-variant pt-5">
          <p className="text-sm font-medium">Meanwhile you can:</p>
          <button type="button" onClick={onTryChat} className="w-full rounded-xl border border-outline-variant px-4 py-3 text-left text-sm hover:bg-surface-low" data-testid="wa-try-chat">
            <span className="font-semibold">Try your AI assistant now</span><span className="block text-xs text-on-surface-variant">Chat as a customer in the test chat — nothing is sent to WhatsApp.</span>
          </button>
          <details className="rounded-xl border border-outline-variant px-4 py-3 text-sm" data-testid="wa-manual-details">
            <summary className="cursor-pointer font-semibold">Manual connect (advanced)</summary>
            <p className="mt-2 text-xs text-on-surface-variant">Already have your own Meta developer app? Connect it with your WhatsApp Business details.</p>
            <div className="mt-3"><WhatsappManualConnect onConnected={onManualConnected} /></div>
          </details>
        </div>
      </div>
    </div>
  );
}
