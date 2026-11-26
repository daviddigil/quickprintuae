"use client";
import { useState } from "react";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui";
import { testGatewayAction } from "./actions";

/** Reads the typed key from the sibling form (if any), otherwise tests the saved one. Never receives a secret back. */
export function GatewayTest({ provider }: { provider: "stripe" }) {
  const [state, setState] = useState<{ loading?: boolean; ok?: boolean; message?: string }>({});
  async function run(e: React.MouseEvent<HTMLButtonElement>) {
    const form = e.currentTarget.closest("form");
    const key = (form?.elements.namedItem("secretKey") as HTMLInputElement | null)?.value ?? "";
    setState({ loading: true });
    try { const r = await testGatewayAction(provider, key); setState({ ok: r.ok, message: r.message }); }
    catch { setState({ ok: false, message: "Test failed" }); }
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-3">
      <Button type="button" variant="outlined" onClick={run} disabled={state.loading} data-testid={`test-${provider}`}>{state.loading ? "Testing…" : "Test credentials"}</Button>
      <span role="status" aria-live="polite" data-testid={`test-result-${provider}`} className={`text-sm ${state.ok ? "text-success" : "text-critical"}`}>{state.message ? `${state.ok ? "Passed: " : "Failed: "}${state.message}` : ""}</span>
    </span>
  );
}

export function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" aria-label={label} onClick={() => navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); }).catch(() => {})}
      className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-shape-md border border-outline-variant px-3 text-sm hover:bg-surface-low">
      <Copy className="h-4 w-4" aria-hidden />{done ? "Copied" : "Copy"}
    </button>
  );
}
