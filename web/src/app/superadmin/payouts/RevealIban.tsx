"use client";
import { useState } from "react";
import { Button } from "@/components/ui";
import { revealIbanAction } from "./actions";

export function RevealIban({ accountId }: { accountId: string }) {
  const [v, setV] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  if (v) return <span className="font-mono text-xs" data-testid="revealed-iban">{v} <button type="button" className="ms-2 min-h-11 text-primary underline" onClick={() => setV(null)}>Hide</button></span>;
  return (
    <span>
      <Button type="button" size="sm" variant="text" onClick={async () => { const r = await revealIbanAction(accountId); if (r.ok) setV(r.iban!); else setErr(r.error ?? "Failed"); }}>Reveal full IBAN (audited)</Button>
      {err && <span className="ms-2 text-xs text-critical">{err}</span>}
    </span>
  );
}
