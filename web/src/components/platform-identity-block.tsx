import type { PlatformIdentity } from "@/lib/platform-identity";

/** Issuer block for platform documents (SaaS invoices, credit notes, statements). */
export function PlatformIdentityBlock({ identity, className = "" }: { identity: PlatformIdentity; className?: string }) {
  return (
    <div className={className} data-testid="platform-identity">
      <p className="font-bold">{identity.legalName || "QuickPrint UAE"}</p>
      {identity.address && <p className="text-on-surface-variant">{identity.address}</p>}
      {identity.email && <p className="text-on-surface-variant">{identity.email}</p>}
      {identity.vatRegistered && identity.trn ? <p className="font-semibold">TRN: {identity.trn}</p> : <p className="text-xs text-on-surface-variant">Not VAT registered</p>}
    </div>
  );
}
