"use client";
import { useState } from "react";
import { Button } from "@/components/ui";

/** Reads the key from the sibling input named `keyField` (if typed) and calls the test endpoint. */
export function TestConnection({ provider, keyField }: { provider: "stripe" | "mamo"; keyField: string }) {
  const [state, setState] = useState<{ loading?: boolean; ok?: boolean; message?: string }>({});
  async function run(e: React.MouseEvent<HTMLButtonElement>) {
    const form = e.currentTarget.closest("form");
    const key = (form?.elements.namedItem(keyField) as HTMLInputElement | null)?.value;
    const sandbox = (form?.elements.namedItem("sandbox") as HTMLInputElement | null)?.checked;
    setState({ loading: true });
    const res = await fetch("/api/v1/admin/payments/test", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider, key, sandbox }) });
    const data = await res.json().catch(() => ({ ok: false, message: "Request failed" }));
    setState({ ok: data.ok, message: data.message });
  }
  return (
    <span className="inline-flex items-center gap-3">
      <Button type="button" variant="secondary" onClick={run} disabled={state.loading}>{state.loading ? "Testing…" : "Test connection"}</Button>
      {state.message && <span className={`text-sm ${state.ok ? "text-emerald-700" : "text-red-600"}`}>{state.ok ? "✓ " : "✗ "}{state.message}</span>}
    </span>
  );
}
