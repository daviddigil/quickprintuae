"use client";
import { RIGHTS_DECLARATION } from "@/lib/compliance";

/** The customer's "I may print this" declaration (UAE content-liability control), shared by the online and walk-in checkouts so the wording cannot drift. */
export function RightsDeclarationCheckbox({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <section data-testid="rights-declaration">
      <label className="flex min-h-11 cursor-pointer gap-3 rounded-lg border border-outline-variant p-3 text-sm">
        <input type="checkbox" name="rightsDeclared" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-1" data-testid="rights-checkbox" required />
        <span>
          <span className="block">{RIGHTS_DECLARATION.en}</span>
          <span dir="rtl" lang="ar" className="mt-1 block text-on-surface-variant">{RIGHTS_DECLARATION.ar}</span>
        </span>
      </label>
    </section>
  );
}
