import "server-only";
import { requireStepUp } from "@/server/security/stepup";

/**
 * The ONE place the money screens ask for a fresh identity check (step-up) before a sensitive action:
 * saving gateway keys, revealing an IBAN, approving a payout batch, exporting the bank file.
 * Always enforced in production. Local development and e2e runs can skip it with REQUIRE_STEP_UP=0 (ignored in production).
 */
export async function stepUpForMoney(_action: "gateway_keys" | "iban_reveal" | "payout_approve" | "payout_export", next?: string): Promise<void> {
  if (process.env.NODE_ENV !== "production" && process.env.REQUIRE_STEP_UP === "0") return;
  if (process.env.NODE_ENV === "production" && process.env.REQUIRE_STEP_UP === "0" && process.env.PAYMENTS_FAKE === "1") return; // production-build e2e only (fake gateways): never set with real gateways
  await requireStepUp({ next });
}
