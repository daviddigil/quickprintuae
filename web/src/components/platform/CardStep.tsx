"use client";
import { useEffect, useState } from "react";
import { Alert, Button } from "@/components/ui";
import { fill, getCopy, type Locale } from "@/lib/i18n";

type Code = "pending" | "failed" | "cancelled" | "card_reused" | "card_blocked" | "error";

/**
 * Step 2 of signup (and the 'incomplete' admin screen): put a card on file to start the free trial (length: superadmin setting).
 * Live gateway: redirects to the gateway's hosted card page (3-D Secure included; no card data on our servers).
 * Test mode (PAYMENTS_FAKE / local development): a clearly labelled "Use test card" button completes the step without a gateway.
 */
export function CardStep({ locale = "en", live, fake, email, initial, readQuery, trialDays }: { locale?: Locale; trialDays?: number; live: boolean; fake: boolean; email?: string; initial?: string; /** read ?card=... from the URL (set by the gateway return route) */ readQuery?: boolean }) {
  const t = getCopy(locale, trialDays).signup.card;
  const [busy, setBusy] = useState<"live" | "fake" | null>(null);
  const first = initial && initial in t ? (initial as Code) : null;
  const [error, setError] = useState<string | null>(first && first !== "pending" ? (t[first] as string) : null);
  const [notice, setNotice] = useState<string | null>(initial === "pending" ? t.pending : null);
  useEffect(() => {
    if (!readQuery) return;
    const c = new URLSearchParams(window.location.search).get("card");
    if (c === "pending") setNotice(t.pending);
    else if (c && c in t && c !== "pending") setError(t[c as Code] as string);
  }, [readQuery, t]);

  async function go(kind: "live" | "fake") {
    setError(null); setBusy(kind);
    try {
      const res = await fetch(kind === "live" ? "/api/v1/billing/card/setup" : "/api/v1/billing/card/fake", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error ?? t.error); setBusy(null); return; }
      if (kind === "live" && data.mode === "redirect") { window.location.href = data.url; return; }
      if (kind === "fake" && data.ok) { window.location.href = data.redirect ?? "/admin?welcome=1"; return; }
      setError(data.error ?? t.error); setBusy(null);
    } catch { setError(t.error); setBusy(null); }
  }

  return (
    <section aria-labelledby="card-h" data-testid="card-step" className="space-y-4 rounded-shape-xl border border-outline-variant bg-surface-lowest p-5 sm:p-6">
      <div>
        <h2 id="card-h" className="text-xl font-bold">{t.h}</h2>
        <p className="mt-1 text-sm text-on-surface-variant">{t.lead}</p>
      </div>
      {error && <Alert>{error}</Alert>}
      {notice && <Alert tone="blue">{notice}</Alert>}
      <p className="rounded-shape-md bg-info-container px-4 py-3 text-sm text-on-info-container">{t.noCharge}</p>
      {live && (
        <div className="space-y-2">
          <Button size="lg" className="w-full" onClick={() => go("live")} disabled={busy !== null}>{busy === "live" ? t.opening : t.cta}</Button>
          <p className="text-xs text-on-surface-variant">{t.secure}</p>
        </div>
      )}
      {fake && (
        <div className="space-y-2 rounded-shape-md border border-dashed border-outline p-4">
          <Button size="lg" variant="outlined" className="w-full" onClick={() => go("fake")} disabled={busy !== null} data-testid="use-test-card">{busy === "fake" ? t.opening : t.testCta}</Button>
          <p className="text-xs text-on-surface-variant">{t.testNote}</p>
        </div>
      )}
      {email && <p className="text-xs text-on-surface-variant">{fill(t.signedInAs, { email })} <a href="/logout" className="underline">{t.signOut}</a></p>}
    </section>
  );
}
