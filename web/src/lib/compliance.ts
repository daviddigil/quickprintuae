/**
 * Shared UAE-compliance constants. Pure (no server imports) so client components, server code and tests can use it.
 * Periods and wording are PLACEHOLDERS from general knowledge: a UAE lawyer / accountant must confirm them
 * (see docs/UAE_COMPLIANCE.md).
 */

/** Bump when the customer rights declaration wording changes. */
export const RIGHTS_DECLARATION_VERSION = "2026-11-27";

export const RIGHTS_DECLARATION = {
  en: "I own this content or have the right to print it, and it contains nothing unlawful, offensive, infringing or counterfeit.",
  ar: "أقرّ بأنني أملك هذا المحتوى أو لدي الحق في طباعته، وأنه لا يتضمن أي محتوى مخالف للقانون أو مسيء أو منتهك للحقوق أو مقلّد.",
} as const;

/** Days the shop (controller) / platform has to answer a data-subject request. Confirm the legal deadline with a lawyer. */
export const DSR_DUE_DAYS = 30;
export const DSR_KINDS = ["access", "erasure", "correction", "objection"] as const;
export type DsrKind = (typeof DSR_KINDS)[number];
export const DSR_STATUSES = ["requested", "in_progress", "completed", "rejected"] as const;

export const REPORT_CATEGORIES = ["illegal", "offensive", "infringes_ip", "counterfeit", "personal_data", "other"] as const;
export type ReportCategory = (typeof REPORT_CATEGORIES)[number];
export const REPORT_STATUSES = ["open", "reviewing", "actioned", "rejected"] as const;

export const INCIDENT_SEVERITIES = ["low", "medium", "high", "critical"] as const;
export const INCIDENT_STATUSES = ["open", "contained", "resolved"] as const;

export const CONSENT_PURPOSES = ["cookies_analytics", "marketing_email", "marketing_whatsapp", "rights_declaration"] as const;
export type ConsentPurpose = (typeof CONSENT_PURPOSES)[number];

/** Retention schedule per data class (placeholders: confirm with a lawyer/accountant). `days: null` = until erased on request. */
export const RETENTION_SCHEDULE = [
  { key: "confidential_files", label: "Confidential print files (IDs, passports)", days: 1, basis: "Deleted shortly after the job completes (shop setting, default 24h)" },
  { key: "walkin_files", label: "Walk-in uploaded files", days: 1, basis: "Deleted after printing / expiry" },
  { key: "customer_personal_data", label: "Customer account and order contact data", days: null, basis: "Kept while the account exists; anonymised on a verified erasure request, except what tax law requires us to keep" },
  { key: "tax_records", label: "Invoices, credit notes, order and payment ledger", days: 5 * 365, basis: "UAE tax record-keeping (commonly 5 years; lawyer/accountant to confirm). Personal fields may be minimised, the financial record stays" },
  { key: "audit_logs", label: "Audit and security logs", days: 365, basis: "Security monitoring and dispute evidence" },
  { key: "consent_logs", label: "Consent and legal acceptance records", days: 5 * 365, basis: "Evidence that consent / acceptance was given" },
  { key: "ai_prompts", label: "AI design prompts", days: 90, basis: "Quality and abuse review" },
] as const;

export function dsrDueAt(from = new Date()): Date {
  return new Date(from.getTime() + DSR_DUE_DAYS * 24 * 3600 * 1000);
}
