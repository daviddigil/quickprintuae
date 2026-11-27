/**
 * Legal documents registry. Pure module (no server imports): safe in client components and tests.
 * LEGAL_VERSION is the single version string for ALL four documents. Bump it (and LEGAL_UPDATED) whenever the text of
 * any document changes; `needsReaccept` then reports every shop whose recorded acceptance is older.
 * All texts are TEMPLATES that a UAE lawyer must review before launch (see docs/LEGAL_CHECKLIST.md).
 */
export const LEGAL_VERSION = "2026-11-27";
/** ISO date the texts were last updated (shown on every page). */
export const LEGAL_UPDATED = "2026-11-27";

export const LEGAL_KEYS = ["terms", "privacy", "refunds", "seller-agreement"] as const;
export type LegalKey = (typeof LEGAL_KEYS)[number];
/** Documents the shop owner must accept at signup. The refund policy is informational (linked, not separately ticked). */
export const SIGNUP_ACCEPT_KEYS: readonly LegalKey[] = ["terms", "privacy", "seller-agreement"];

/** English path of each document (Arabic is "/ar" + path). */
export const LEGAL_PATHS: Record<LegalKey, string> = {
  terms: "/terms", privacy: "/privacy", refunds: "/refunds", "seller-agreement": "/seller-agreement",
};

export interface LegalAcceptanceLike { version: string; documents: string[]; acceptedAt?: Date | string | null }

/**
 * True when a shop has never accepted, or accepted an older LEGAL_VERSION, or the acceptance is missing a required document.
 * Nothing calls this to block anyone yet: existing shops are not forced to re-accept.
 */
export function needsReaccept(latest: LegalAcceptanceLike | null | undefined, current = LEGAL_VERSION): boolean {
  if (!latest) return true;
  if (latest.version !== current) return true;
  return SIGNUP_ACCEPT_KEYS.some((k) => !latest.documents.includes(k));
}
