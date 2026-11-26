/** IBAN helpers for payout accounts. UAE IBANs are 23 characters: AE + 2 check digits + 3-digit bank code + 16-digit account number. */
export const UAE_BANKS = [
  "Abu Dhabi Commercial Bank (ADCB)", "Abu Dhabi Islamic Bank (ADIB)", "Ajman Bank", "Commercial Bank of Dubai (CBD)", "Dubai Islamic Bank",
  "Emirates Islamic", "Emirates NBD", "First Abu Dhabi Bank (FAB)", "Mashreq Bank", "National Bank of Fujairah", "National Bank of Umm Al Qaiwain",
  "RAKBANK", "Sharjah Islamic Bank", "United Arab Bank", "HSBC UAE", "Standard Chartered UAE", "Wio Bank", "Other (type the bank name)",
] as const;

export const cleanIban = (s: string) => (s ?? "").replace(/[\s-]/g, "").toUpperCase();

/** ISO 13616 mod-97 check. */
export function ibanChecksumOk(iban: string): boolean {
  const s = cleanIban(iban);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)) return false;
  const re = s.slice(4) + s.slice(0, 4);
  let rem = 0;
  for (const ch of re) {
    const v = /\d/.test(ch) ? ch : String(ch.charCodeAt(0) - 55);
    for (const d of v) rem = (rem * 10 + Number(d)) % 97;
  }
  return rem === 1;
}

export type IbanResult = { ok: true; iban: string; last4: string } | { ok: false; error: string };

/** Payouts are in AED to UAE banks, so only AE IBANs are accepted. */
export function validateUaeIban(input: string): IbanResult {
  const iban = cleanIban(input);
  if (!iban) return { ok: false, error: "Enter your IBAN" };
  if (!iban.startsWith("AE")) return { ok: false, error: "Payouts go to UAE bank accounts: the IBAN must start with AE" };
  if (iban.length !== 23) return { ok: false, error: "A UAE IBAN has 23 characters (AE + 21 digits)" };
  if (!/^AE\d{21}$/.test(iban)) return { ok: false, error: "A UAE IBAN is AE followed by 21 digits" };
  if (!ibanChecksumOk(iban)) return { ok: false, error: "This IBAN is not valid. Check it for typing mistakes" };
  return { ok: true, iban, last4: iban.slice(-4) };
}

/** 2-space grouping for display: AE07 0331 2345 6789 0123 456 */
export const formatIban = (iban: string) => cleanIban(iban).replace(/(.{4})/g, "$1 ").trim();
export const maskIban = (iban: string) => { const s = cleanIban(iban); return s.length > 8 ? `${s.slice(0, 4)} •••• •••• •••• ${s.slice(-4)}` : "••••"; };
