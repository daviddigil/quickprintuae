"use client";
import { useState } from "react";
import { Button, Field, Textarea } from "@/components/ui";
import { reviewAction } from "../actions";

const CHECKS = [
  "The document is legible and looks genuine (no edits, full page)",
  "Legal business name on the licence matches what was entered",
  "Licence number matches what was entered",
  "Licence is valid, with an expiry date in the future",
  "Licensing authority matches the document",
  "Business activity covers printing or a related trade",
];

export function ReviewPanel({ id, flagged, canApprove, blockedReason }: { id: string; flagged: boolean; canApprove: boolean; blockedReason?: string }) {
  const [checked, setChecked] = useState<boolean[]>(CHECKS.map(() => false));
  const all = checked.every(Boolean);
  const inputCls = "w-full";
  return (
    <div className="space-y-6" data-testid="review-panel">
      <fieldset>
        <legend className="mb-2 text-sm font-semibold">Checklist (needed to approve)</legend>
        <ul className="space-y-1">
          {CHECKS.map((c, i) => (
            <li key={c}>
              <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
                <input type="checkbox" className="size-5 accent-[var(--md-primary)]" checked={checked[i]} onChange={(e) => setChecked((p) => p.map((x, j) => (j === i ? e.target.checked : x)))} />
                {c}
              </label>
            </li>
          ))}
        </ul>
      </fieldset>

      <form action={reviewAction} className="space-y-3 rounded-shape-md border border-outline-variant p-4">
        <input type="hidden" name="id" value={id} /><input type="hidden" name="action" value="approve" />
        <h3 className="font-semibold">Approve</h3>
        {!canApprove && <p className="text-sm text-critical">{blockedReason}</p>}
        {flagged && (
          <Field label="Reason for approving despite review flags" hint="(required, audited)">
            <Textarea name="overrideReason" rows={2} className={inputCls} />
          </Field>
        )}
        <Field label="Note to the owner" hint="(optional)"><Textarea name="note" rows={2} className={inputCls} /></Field>
        <Button disabled={!all || !canApprove} data-testid="approve">Approve and verify</Button>
        {!all && <p className="text-xs text-on-surface-variant">Tick every checklist item to approve.</p>}
      </form>

      <form action={reviewAction} className="space-y-3 rounded-shape-md border border-outline-variant p-4">
        <input type="hidden" name="id" value={id} /><input type="hidden" name="action" value="needs_info" />
        <h3 className="font-semibold">Request more information</h3>
        <Field label="What does the owner need to send?" hint="(the owner sees this)"><Textarea name="note" rows={2} required minLength={5} className={inputCls} /></Field>
        <Button variant="tonal" data-testid="needs-info">Request information</Button>
      </form>

      <form action={reviewAction} className="space-y-3 rounded-shape-md border border-outline-variant p-4">
        <input type="hidden" name="id" value={id} /><input type="hidden" name="action" value="reject" />
        <h3 className="font-semibold">Reject</h3>
        <Field label="Reason" hint="(required, the owner sees this)"><Textarea name="note" rows={2} required minLength={5} className={inputCls} /></Field>
        <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" name="block" className="size-5 accent-[var(--md-primary)]" /> Also block this licence number and business name from signing up again (fraud)</label>
        <Button variant="danger" data-testid="reject">Reject</Button>
      </form>
    </div>
  );
}
