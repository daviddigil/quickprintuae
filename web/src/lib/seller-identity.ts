/**
 * Seller identity shown on every sale (storefront footer, checkout, order confirmation, order email, tax invoice).
 * Pure (no server imports). The legal name, licence number, licensing authority and TRN come ONLY from a verified
 * seller_verifications row, never from fields the shop owner typed freely. Address and contact details come from the
 * tenant record. An unverified shop gets `null`: callers must then show no legal claims at all.
 */
export interface SellerVerificationLike { status: string; legalName: string; licenceNumber: string; authority: string; trn?: string | null }
export interface SellerTenantLike {
  name: string;
  address?: string | null; emirate?: string | null;
  email?: string | null; phone?: string | null; complaintEmail?: string | null;
  /** owner-typed (never used for the legal identity) */
  legalName?: string | null; trn?: string | null;
}
export interface SellerIdentity {
  /** the verified legal / trade-licence name: "Sold by <tradeName>" */
  tradeName: string;
  licenceNumber: string;
  authority: string;
  trn: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
  /** where customers send complaints (falls back to the shop email) */
  complaintEmail: string | null;
}

const clean = (v: string | null | undefined) => (v ?? "").trim() || null;

export function buildSellerIdentity(tenant: SellerTenantLike, verification: SellerVerificationLike | null | undefined): SellerIdentity | null {
  if (!verification || verification.status !== "verified") return null;
  const tradeName = clean(verification.legalName), licenceNumber = clean(verification.licenceNumber), authority = clean(verification.authority);
  if (!tradeName || !licenceNumber || !authority) return null;
  const addr = [clean(tenant.address), clean(tenant.emirate)].filter(Boolean).join(", ");
  const email = clean(tenant.email);
  return {
    tradeName, licenceNumber, authority,
    trn: clean(verification.trn), // the verified TRN only
    address: addr || null,
    email,
    phone: clean(tenant.phone),
    complaintEmail: clean(tenant.complaintEmail) ?? email,
  };
}

/** One-line plain-text version for emails and receipts. */
export function sellerIdentityLines(id: SellerIdentity | null, shopName: string, locale: "en" | "ar" = "en"): string[] {
  if (!id) return [shopName];
  const L = locale === "ar"
    ? { sold: "البائع", lic: "رخصة تجارية رقم", trn: "الرقم الضريبي", complaints: "للشكاوى" }
    : { sold: "Sold by", lic: "Trade licence no.", trn: "TRN", complaints: "Complaints" };
  return [
    `${L.sold}: ${id.tradeName}`,
    `${L.lic} ${id.licenceNumber} (${id.authority})`,
    ...(id.trn ? [`${L.trn}: ${id.trn}`] : []),
    ...(id.address ? [id.address] : []),
    ...[id.phone, id.email].filter(Boolean) as string[],
    ...(id.complaintEmail ? [`${L.complaints}: ${id.complaintEmail}`] : []),
  ];
}
