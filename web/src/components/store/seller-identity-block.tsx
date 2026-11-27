import type { SellerIdentity } from "@/lib/seller-identity";

/** "Sold by ..." block (verified identity only). Renders nothing for an unverified shop. */
export function SellerIdentityBlock({ identity, className = "", testid = "seller-identity" }: { identity: SellerIdentity | null; className?: string; testid?: string }) {
  if (!identity) return null;
  return (
    <div className={className} data-testid={testid}>
      <p className="font-semibold text-on-surface">Sold by {identity.tradeName}</p>
      <p className="mt-1">Trade licence no. {identity.licenceNumber} ({identity.authority})</p>
      {identity.trn && <p>TRN: {identity.trn}</p>}
      {identity.address && <p>{identity.address}</p>}
      {(identity.phone || identity.email) && <p>{[identity.phone, identity.email].filter(Boolean).join(" · ")}</p>}
      {identity.complaintEmail && <p>Complaints: <a className="underline" href={`mailto:${identity.complaintEmail}`}>{identity.complaintEmail}</a></p>}
    </div>
  );
}
