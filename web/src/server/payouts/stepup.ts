import "server-only";

/**
 * The ONE place the money screens ask for a fresh identity check (step-up) before a sensitive action:
 * saving gateway keys, revealing an IBAN, approving a payout batch.
 * Agent C provides requireStepUp() in src/server/security/stepup; until it is wired, this is a no-op so it can be swapped here only.
 */
/* eslint-disable @typescript-eslint/no-unused-vars */
export async function stepUpForMoney(_action: "gateway_keys" | "iban_reveal" | "payout_approve" | "payout_export", _next?: string): Promise<void> {
  /* no-op until requireStepUp() is wired in */
}
