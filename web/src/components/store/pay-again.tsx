"use client";
import { useState } from "react";
import { Button } from "@/components/ui";

export function PayAgain({ store, orderId, token, providers }: { store: string; orderId: string; token?: string; providers: ("stripe" | "mamo")[] }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!providers.length) return null;
  async function pay(provider: "stripe" | "mamo") {
    setBusy(true); setErr(null);
    const res = await fetch(`/api/v1/store/${store}/orders/${orderId}/pay`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider, t: token }) });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.url) { window.location.href = data.url; return; }
    setBusy(false); setErr(data.error ?? "Could not open payment page");
  }
  return (
    <div className="mt-4">
      <div className="flex flex-wrap gap-2">
        {providers.map((p) => (
          <Button key={p} variant="store" disabled={busy} onClick={() => pay(p)}>{busy ? "Opening…" : `Pay now${providers.length > 1 ? ` with ${p === "stripe" ? "card (Stripe)" : "Mamo Pay"}` : ""}`}</Button>
        ))}
      </div>
      {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
    </div>
  );
}
