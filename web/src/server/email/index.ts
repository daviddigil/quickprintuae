import "server-only";

export interface EmailMessage { to: string; subject: string; text: string; html?: string; /** for logs only, e.g. "verification.approved" */ tag?: string }
export interface EmailResult { ok: boolean; provider: string; error?: string }

/**
 * Transactional email. STUB: logs to the console. The hardening agent replaces the body with real providers
 * (Resend / SMTP, chosen by env) and keeps this signature; it must never throw (return ok:false instead).
 */
export async function sendEmail(msg: EmailMessage): Promise<EmailResult> {
  console.log(`[email:console] to=${msg.to} tag=${msg.tag ?? "-"} subject=${msg.subject}`);
  return { ok: true, provider: "console" };
}
