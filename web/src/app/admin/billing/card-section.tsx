"use client";
import { useState } from "react";
import { Alert, Button } from "@/components/ui";

/** Update the card on file: live gateway -> its hosted page; test mode -> swap in another test card. */
export function CardSection({ live, fake, hasCard }: { live: boolean; fake: boolean; hasCard: boolean }) {
  const [busy, setBusy] = useState<"live" | "fake" | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function go(kind: "live" | "fake") {
    setError(null); setBusy(kind);
    try {
      const res = await fetch(kind === "live" ? "/api/v1/billing/card/setup" : "/api/v1/billing/card/fake", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(kind === "fake" ? { cardId: `t${Date.now().toString(36)}` } : {}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error ?? "Something went wrong. Please try again."); setBusy(null); return; }
      if (kind === "live" && data.mode === "redirect") { window.location.href = data.url; return; }
      window.location.href = "/admin/billing?ok=Card%20updated";
    } catch { setError("Something went wrong. Please try again."); setBusy(null); }
  }
  return (
    <div className="space-y-3">
      {error && <Alert>{error}</Alert>}
      <div className="flex flex-wrap gap-2">
        {live && <Button variant="outlined" onClick={() => go("live")} disabled={busy !== null}>{busy === "live" ? "Opening…" : hasCard ? "Update card" : "Add card"}</Button>}
        {fake && <Button variant="outlined" onClick={() => go("fake")} disabled={busy !== null} data-testid="swap-test-card">{busy === "fake" ? "Updating…" : "Use another test card"}</Button>}
      </div>
      {live && <p className="text-xs text-on-surface-variant">You enter the card on the payment provider&apos;s secure page. QuickPrint never sees or stores the card number.</p>}
      {fake && <p className="text-xs text-on-surface-variant">Test mode: no real card is charged.</p>}
    </div>
  );
}
