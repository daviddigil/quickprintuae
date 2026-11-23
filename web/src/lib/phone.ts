/**
 * Normalise a phone number to E.164, with UAE-friendly handling:
 *   0501234567 / 501234567 / 971501234567 / 00971501234567 / +971 50 123 4567  ->  +971501234567
 * Any other number must start with "+" and have 8–15 digits. Returns null when invalid.
 */
export function normalizePhone(input: string): string | null {
  const raw = (input ?? "").trim();
  if (!raw) return null;
  const hasPlus = raw.startsWith("+");
  let d = raw.replace(/[^\d]/g, "");
  if (!d) return null;
  if (!hasPlus && d.startsWith("00")) d = d.slice(2); // 00971…
  else if (!hasPlus && d.startsWith("971")) { /* already country code */ }
  else if (!hasPlus && /^0?5\d{8}$/.test(d)) d = "971" + d.replace(/^0/, ""); // UAE mobile
  else if (!hasPlus && /^0[2-9]\d{7,8}$/.test(d)) d = "971" + d.slice(1); // UAE landline
  else if (!hasPlus) return null; // other countries must use +
  if (d.startsWith("971")) return /^971\d{8,9}$/.test(d) ? "+" + d : null;
  return /^\d{8,15}$/.test(d) ? "+" + d : null;
}

export const isUaeMobile = (e164: string) => /^\+9715\d{8}$/.test(e164);

/** Mask for staff-facing lists where full numbers aren't needed: +971 50 ••• 4567 */
export const maskPhone = (e164: string) => (e164.length > 8 ? `${e164.slice(0, 7)} ••• ${e164.slice(-4)}` : e164);
