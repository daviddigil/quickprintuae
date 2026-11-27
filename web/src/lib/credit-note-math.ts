import { round2 } from "@/lib/pricing";

/** UAE standard VAT rate used when only a net amount is known. */
export const UAE_VAT_RATE = 5;

/**
 * Splits a credited (VAT-inclusive) amount into net + VAT in the same proportion as the original document.
 * Full credit of a 105.00 order with 5.00 VAT gives 100.00 + 5.00; a partial credit keeps the ratio. All values in AED, 2 dp.
 */
export function creditNoteAmounts(amount: number, originalTotal: number, originalVat: number): { subtotal: number; vat: number; total: number } {
  const total = round2(amount);
  if (!Number.isFinite(total) || total <= 0) throw new Error("credit amount must be positive");
  const vat = originalTotal > 0 && originalVat > 0 ? Math.min(total, round2((total * originalVat) / originalTotal)) : 0;
  return { subtotal: round2(total - vat), vat, total };
}

/** VAT part of a VAT-inclusive amount at `rate` percent. */
export const vatOfGross = (gross: number, rate = UAE_VAT_RATE): number => round2(gross - gross / (1 + rate / 100));

export const formatCreditNoteNumber = (prefix: string, seq: number): string => `${prefix}-CN-${String(seq).padStart(5, "0")}`;

export const PLATFORM_SCOPE = "platform";
export const tenantScope = (tenantId: string) => `tenant:${tenantId}`;
