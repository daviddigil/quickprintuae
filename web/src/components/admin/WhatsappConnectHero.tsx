"use client";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, MessageCircle } from "lucide-react";
import { Alert } from "@/components/ui";
import { WhatsappActivationSheet } from "./WhatsappActivationSheet";

declare global { interface Window { FB?: { init: (o: object) => void; login: (cb: (r: { authResponse?: { code?: string } }) => void, o: object) => void }; fbAsyncInit?: () => void } }

export interface PlatformInfo { ready: boolean; appId: string | null; configId: string | null; graphVersion: string }
type Phase = "idle" | "opening" | "verifying" | "enabling";
const STEPS: { phase: Phase; label: string }[] = [
  { phase: "opening", label: "Opening Meta sign-in" },
  { phase: "verifying", label: "Verifying your WhatsApp number" },
  { phase: "enabling", label: "Turning on your AI assistant" },
];

/**
 * THE one-click button. Platform ready → Meta Embedded Signup popup with coexistence (keeps the WhatsApp Business app working).
 * Platform not ready (Tech Provider not added yet) → the same button opens a friendly "activation pending" sheet. No env/Meta jargon for owners.
 */
export function WhatsappConnectHero({ platform, requested, onConnected, onRequested, onManualConnected, onTryChat }: {
  platform: PlatformInfo; requested: boolean; onConnected: (phone: string | null) => void; onRequested: () => void;
  onManualConnected: (r: { webhookUrl: string; verifyToken: string | null }) => void; onTryChat: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false);
  const session = useRef<{ wabaId?: string; phoneNumberId?: string }>({});
  const busy = phase !== "idle";
  const { ready, appId, configId, graphVersion } = platform;

  useEffect(() => {
    if (!ready || !appId) return;
    // Embedded Signup tells us which WABA / number the owner picked via a window message from facebook.com
    const onMsg = (ev: MessageEvent) => {
      let host = ""; try { host = new URL(ev.origin).hostname; } catch { return; }
      if (!/(^|\.)facebook\.com$/.test(host)) return;
      try {
        const d = typeof ev.data === "string" ? JSON.parse(ev.data) : ev.data;
        if (d?.type !== "WA_EMBEDDED_SIGNUP") return;
        if (d.event === "FINISH" || d.event === "FINISH_ONLY_WABA") session.current = { wabaId: d.data?.waba_id, phoneNumberId: d.data?.phone_number_id };
        if (d.event === "CANCEL") { setPhase("idle"); setNote("Sign-in was closed before it finished. Tap Connect WhatsApp whenever you're ready."); }
      } catch { /* not ours */ }
    };
    window.addEventListener("message", onMsg);
    if (window.FB) window.FB.init({ appId, autoLogAppEvents: true, xfbml: true, version: graphVersion });
    else {
      window.fbAsyncInit = () => window.FB?.init({ appId, autoLogAppEvents: true, xfbml: true, version: graphVersion });
      if (!document.getElementById("facebook-jssdk")) {
        const s = document.createElement("script"); s.id = "facebook-jssdk"; s.async = true; s.defer = true; s.crossOrigin = "anonymous"; s.src = "https://connect.facebook.net/en_US/sdk.js"; document.body.appendChild(s);
      }
    }
    return () => window.removeEventListener("message", onMsg);
  }, [ready, appId, graphVersion]);

  function start() {
    setErr(null); setNote(null);
    if (!ready || !appId || !configId) return setSheet(true);
    if (!window.FB) return setErr("WhatsApp sign-in is still loading. Please try again in a few seconds.");
    session.current = {}; setPhase("opening");
    window.FB.login((r) => {
      const code = r.authResponse?.code;
      if (!code) { setPhase("idle"); setNote((n) => n ?? "Sign-in was closed before it finished. Tap Connect WhatsApp whenever you're ready."); return; }
      setPhase("verifying");
      // the WA_EMBEDDED_SIGNUP message can land just after the login callback
      setTimeout(async () => {
        const { wabaId, phoneNumberId } = session.current;
        if (!wabaId || !phoneNumberId) { setPhase("idle"); return setErr("We didn't receive your WhatsApp number from Meta. Please tap Connect WhatsApp and finish all the steps."); }
        try {
          setPhase("enabling");
          const res = await fetch("/api/v1/admin/whatsapp/connect", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code, wabaId, phoneNumberId, mode: "coexistence" }) });
          const j = await res.json().catch(() => ({}));
          if (!res.ok) { setPhase("idle"); if (j.code === "platform_not_ready") return setSheet(true); return setErr(j.error ?? "We couldn't connect your number. Please try again."); }
          setPhase("idle"); onConnected(j.account?.displayPhone ?? null);
        } catch { setPhase("idle"); setErr("We couldn't reach the server. Check your connection and try again."); }
      }, 800);
    }, { config_id: configId, response_type: "code", override_default_response_type: true, extras: { setup: {}, featureType: "whatsapp_business_app_onboarding", sessionInfoVersion: "3" } });
  }

  const stepIdx = STEPS.findIndex((s) => s.phase === phase);
  return (
    <section className="overflow-hidden rounded-3xl border border-success/50 bg-gradient-to-br from-emerald-50 via-white to-white p-6 shadow-sm sm:p-8" data-testid="wa-hero" aria-labelledby="wa-hero-title">
      <div className="flex flex-col gap-6 md:flex-row md:items-center">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-[#25D366] text-white shadow-md" aria-hidden><MessageCircle className="h-8 w-8" /></div>
        <div className="min-w-0 flex-1">
          <h2 id="wa-hero-title" className="text-2xl font-bold tracking-tight">Answer customers on WhatsApp — automatically</h2>
          <ul className="mt-3 space-y-1.5 text-sm text-on-surface-variant">
            <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />Keep using your WhatsApp Business app — nothing changes for you.</li>
            <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />AI answers customers, quotes real prices and builds their cart.</li>
            <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />Take over any chat whenever you like — the AI steps back.</li>
          </ul>
        </div>
        <button type="button" onClick={start} disabled={busy} data-testid="connect-whatsapp" data-platform-ready={ready}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl bg-[#25D366] px-7 py-4 text-base font-bold text-white shadow-lg shadow-emerald-500/25 transition hover:bg-[#1fb956] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 active:scale-[0.98] disabled:opacity-70 motion-reduce:transition-none">
          {busy ? <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" aria-hidden /> : <MessageCircle className="h-5 w-5" aria-hidden />}{busy ? "Connecting…" : "Connect WhatsApp"}
        </button>
      </div>

      <div aria-live="polite" className="mt-4 empty:hidden">
        {busy && (
          <ol className="space-y-2 rounded-2xl bg-white/80 p-4 text-sm" data-testid="wa-progress">
            {STEPS.map((s, i) => (
              <li key={s.phase} className={`flex items-center gap-3 ${i < stepIdx ? "text-success" : i === stepIdx ? "font-semibold text-on-surface" : "text-outline"}`}>
                {i < stepIdx ? <CheckCircle2 className="h-4 w-4" aria-hidden /> : i === stepIdx ? <span className="relative flex h-3 w-3" aria-hidden><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60 motion-reduce:animate-none" /><span className="relative inline-flex h-3 w-3 rounded-full bg-success" /></span> : <span className="h-3 w-3 rounded-full border border-outline-variant" aria-hidden />}
                {s.label}
              </li>
            ))}
          </ol>
        )}
        {!busy && err && <Alert>{err}</Alert>}
        {!busy && !err && note && <p className="text-sm text-on-surface-variant" data-testid="wa-note">{note}</p>}
      </div>

      {sheet && <WhatsappActivationSheet requested={requested} onRequested={onRequested} onManualConnected={(r) => { setSheet(false); onManualConnected(r); }} onClose={() => setSheet(false)} onTryChat={() => { setSheet(false); onTryChat(); }} />}
    </section>
  );
}
