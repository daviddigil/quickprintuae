"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, Button, Field, Input, Select } from "@/components/ui";
import { AUTHORITY_NEEDS_DETAIL, LICENCE_AUTHORITIES } from "@/lib/trust/verification";

export interface FormDefaults { legalName?: string; licenceNumber?: string; authority?: string; authorityDetail?: string; licenceExpiry?: string; activity?: string; signatoryName?: string; trn?: string; hasDocument?: boolean }

export function VerificationForm({ defaults = {}, resubmit }: { defaults?: FormDefaults; resubmit?: boolean }) {
  const router = useRouter();
  const [authority, setAuthority] = useState(defaults.authority ?? "");
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const tomorrow = new Date(Date.now() + 86400_000).toISOString().slice(0, 10);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError(null); setFields({}); setBusy(true);
    try {
      const res = await fetch("/api/v1/verification", { method: "POST", body: new FormData(e.currentTarget) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error ?? "Could not save your details."); setFields(data.fields ?? {}); setBusy(false); return; }
      router.refresh();
    } catch { setError("Could not reach the server. Try again."); }
    setBusy(false);
  }
  const bad = (k: string) => (fields[k] ? { "aria-invalid": true as const, "aria-describedby": `err-${k}` } : {});
  const err = (k: string) => fields[k] && <p id={`err-${k}`} className="mt-1 text-xs text-critical">{fields[k]}</p>;

  return (
    <form onSubmit={submit} className="space-y-4" data-testid="verification-form" noValidate>
      {error && <Alert>{error}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><Field label="Legal business name" hint="(exactly as on the licence)"><Input name="legalName" required defaultValue={defaults.legalName} autoComplete="organization" {...bad("legalName")} /></Field>{err("legalName")}</div>
        <div><Field label="Trade licence number"><Input name="licenceNumber" required defaultValue={defaults.licenceNumber} dir="ltr" {...bad("licenceNumber")} /></Field>{err("licenceNumber")}</div>
        <div><Field label="Licence expiry date"><Input name="licenceExpiry" type="date" required min={tomorrow} defaultValue={defaults.licenceExpiry} {...bad("licenceExpiry")} /></Field>{err("licenceExpiry")}</div>
        <div>
          <Field label="Licensing authority">
            <Select name="authority" required value={authority} onChange={(e) => setAuthority(e.target.value)} {...bad("authority")}>
              <option value="" disabled>Choose…</option>
              {LICENCE_AUTHORITIES.map((a) => <option key={a} value={a}>{a}</option>)}
            </Select>
          </Field>{err("authority")}
        </div>
        {AUTHORITY_NEEDS_DETAIL.includes(authority) && (
          <div><Field label={authority === "Other" ? "Name of the authority" : "Free zone name"}><Input name="authorityDetail" required defaultValue={defaults.authorityDetail} {...bad("authorityDetail")} /></Field>{err("authorityDetail")}</div>
        )}
        <div className="sm:col-span-2"><Field label="Licensed business activity" hint="(as on the licence)"><Input name="activity" required defaultValue={defaults.activity} {...bad("activity")} /></Field>{err("activity")}</div>
        <div><Field label="Authorised signatory"><Input name="signatoryName" required defaultValue={defaults.signatoryName} autoComplete="name" {...bad("signatoryName")} /></Field>{err("signatoryName")}</div>
        <div><Field label="TRN" hint="(optional, 15 digits)"><Input name="trn" inputMode="numeric" defaultValue={defaults.trn} dir="ltr" placeholder="100000000000003" {...bad("trn")} /></Field>{err("trn")}</div>
        <div className="sm:col-span-2">
          <Field label="Trade licence document" hint={defaults.hasDocument ? "(leave empty to keep the file you sent)" : "(PDF, JPG or PNG, up to 8 MB)"}>
            <input name="document" type="file" accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png" required={!defaults.hasDocument}
              className="block w-full min-h-11 rounded-shape-md border border-outline-variant bg-surface-lowest p-2 text-sm file:me-3 file:rounded-shape-sm file:border-0 file:bg-secondary-container file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-on-secondary-container" {...bad("document")} />
          </Field>{err("document")}
        </div>
      </div>
      <p className="text-xs text-on-surface-variant">Your licence is stored encrypted and only you and the QuickPrint review team can open it.</p>
      <Button size="lg" disabled={busy}>{busy ? "Sending…" : resubmit ? "Resubmit for review" : "Submit for review"}</Button>
    </form>
  );
}
