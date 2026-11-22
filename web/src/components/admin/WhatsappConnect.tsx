"use client";
import { useEffect, useRef, useState } from "react";
import { Link2 } from "lucide-react";
import { Alert, Button } from "@/components/ui";

declare global { interface Window { FB?: { init: (o: object) => void; login: (cb: (r: { authResponse?: { code?: string } }) => void, o: object) => void }; fbAsyncInit?: () => void } }

/** Meta Embedded Signup with coexistence (featureType whatsapp_business_app_onboarding). Rendered only when WhatsApp is enabled. */
export function WhatsappConnect({ appId, configId, graphVersion, onConnected }: { appId: string; configId: string; graphVersion: string; onConnected: () => void }) {
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const session = useRef<{ wabaId?: string; phoneNumberId?: string }>({});

  useEffect(() => {
    // Embedded Signup posts the chosen WABA / phone number to the window
    const onMsg = (ev: MessageEvent) => {
      if (!/facebook\.com$/.test(new URL(ev.origin).hostname)) return;
      try {
        const d = typeof ev.data === "string" ? JSON.parse(ev.data) : ev.data;
        if (d?.type === "WA_EMBEDDED_SIGNUP" && d.event === "FINISH") session.current = { wabaId: d.data?.waba_id, phoneNumberId: d.data?.phone_number_id };
        if (d?.type === "WA_EMBEDDED_SIGNUP" && d.event === "CANCEL") setBusy(false);
      } catch { /* ignore non-JSON messages */ }
    };
    window.addEventListener("message", onMsg);
    window.fbAsyncInit = () => window.FB?.init({ appId, autoLogAppEvents: true, xfbml: true, version: graphVersion });
    if (!document.getElementById("facebook-jssdk")) {
      const s = document.createElement("script"); s.id = "facebook-jssdk"; s.async = true; s.defer = true; s.crossOrigin = "anonymous"; s.src = "https://connect.facebook.net/en_US/sdk.js";
      document.body.appendChild(s);
    }
    return () => window.removeEventListener("message", onMsg);
  }, [appId, graphVersion]);

  function start() {
    if (!window.FB) return setErr("Facebook SDK not loaded yet — try again in a moment.");
    setBusy(true); setErr(null);
    window.FB.login((r) => {
      const code = r.authResponse?.code;
      if (!code) { setBusy(false); return; }
      // the WA_EMBEDDED_SIGNUP message can land just after the login callback
      setTimeout(async () => {
        const { wabaId, phoneNumberId } = session.current;
        if (!wabaId || !phoneNumberId) { setBusy(false); return setErr("Sign-up did not finish. Please try again."); }
        const res = await fetch("/api/v1/admin/whatsapp/connect", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code, wabaId, phoneNumberId, mode: "coexistence" }) });
        const j = await res.json().catch(() => ({}));
        setBusy(false);
        if (!res.ok) return setErr(j.error ?? "Could not connect");
        onConnected();
      }, 800);
    }, { config_id: configId, response_type: "code", override_default_response_type: true, extras: { setup: {}, featureType: "whatsapp_business_app_onboarding", sessionInfoVersion: "3" } });
  }

  return (
    <div className="space-y-3">
      {err && <Alert>{err}</Alert>}
      <Button onClick={start} disabled={busy} data-testid="connect-whatsapp"><Link2 className="h-4 w-4" />{busy ? "Connecting…" : "Connect WhatsApp Business"}</Button>
      <p className="text-xs text-slate-500">You&apos;ll sign in with Facebook, choose your WhatsApp Business app number and approve access. Your number keeps working in the WhatsApp Business app.</p>
    </div>
  );
}
