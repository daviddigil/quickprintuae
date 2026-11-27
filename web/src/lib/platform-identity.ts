/** Platform (QuickPrint) legal identity shown on SaaS invoices, credit notes and statements. Pure module. */
export interface PlatformIdentity { legalName: string; trn: string; address: string; email: string; vatRegistered: boolean }
export const DEFAULT_PLATFORM_IDENTITY: PlatformIdentity = { legalName: "", trn: "", address: "", email: "", vatRegistered: false };
export const PLATFORM_IDENTITY_KEY = "platformIdentity";

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export function normalizePlatformIdentity(raw: unknown): PlatformIdentity {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    legalName: str(r.legalName, 200), trn: str(r.trn, 15).replace(/\s+/g, ""), address: str(r.address, 400), email: str(r.email, 200),
    vatRegistered: r.vatRegistered === true || r.vatRegistered === "on" || r.vatRegistered === "true",
  };
}

/** UAE TRN: 15 digits. Required when the platform is VAT-registered. */
export const isValidTrn = (t: string) => /^\d{15}$/.test(t);
export function validatePlatformIdentity(i: PlatformIdentity): string | null {
  if (i.vatRegistered && !isValidTrn(i.trn)) return "A VAT-registered business needs a 15-digit TRN.";
  if (i.trn && !isValidTrn(i.trn)) return "TRN must be 15 digits.";
  if (i.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(i.email)) return "Enter a valid email.";
  return null;
}

/** "Tax Invoice" only when the issuer is VAT-registered with a TRN; otherwise "Invoice". */
export const platformDocTitle = (i: PlatformIdentity, kind: "invoice" | "credit_note"): string =>
  kind === "credit_note" ? (i.vatRegistered && i.trn ? "Tax Credit Note" : "Credit Note") : (i.vatRegistered && i.trn ? "Tax Invoice" : "Invoice");
