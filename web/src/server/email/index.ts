import "server-only";

export interface EmailMessage { to: string; subject: string; text: string; html?: string; /** for logs only, e.g. "verification.approved" */ tag?: string }
export interface EmailResult { ok: boolean; provider: string; error?: string }

/**
 * Transactional email. NEVER throws: failures come back as { ok:false, error }.
 *
 *   EMAIL_PROVIDER=resend   RESEND_API_KEY + EMAIL_FROM (a sender on a domain verified in Resend)   -> https://api.resend.com/emails
 *   EMAIL_PROVIDER=console  logs (dev/test default). In production only metadata is logged, never the body.
 *   EMAIL_PROVIDER=smtp     not built in (nodemailer is not a dependency): returns ok:false. Use Resend, or add nodemailer.
 *   unset                   console in dev/test; in production ok:false "email not configured" (we never log reset links in prod)
 *
 * Test hook: with EMAIL_PROVIDER=console and EMAIL_TEST_OUTBOX=1 the last 50 messages are kept in memory and readable
 * at GET /api/v1/test/outbox (404 unless EMAIL_TEST_OUTBOX=1). Never set it in production.
 */
const isProd = () => process.env.NODE_ENV === "production";
type G = typeof globalThis & { __qpOutbox?: (EmailMessage & { at: string })[] };
export const outbox = (): (EmailMessage & { at: string })[] => ((globalThis as G).__qpOutbox ??= []);

export const emailProvider = () => (process.env.EMAIL_PROVIDER || (isProd() ? "" : "console")).toLowerCase();
const from = () => process.env.EMAIL_FROM || "QuickPrint UAE <no-reply@quickprint.ae>";

export async function sendEmail(msg: EmailMessage): Promise<EmailResult> {
  const provider = emailProvider();
  try {
    if (!msg.to || !/^[^\s@]+@[^\s@]+$/.test(msg.to)) return { ok: false, provider: provider || "none", error: "invalid recipient" };
    if (provider === "console") {
      if (process.env.EMAIL_TEST_OUTBOX === "1") { const o = outbox(); o.push({ ...msg, at: new Date().toISOString() }); if (o.length > 50) o.shift(); }
      console.log(isProd() ? `[email:console] to=${msg.to} tag=${msg.tag ?? "-"} subject=${msg.subject}` : `[email:console] to=${msg.to} tag=${msg.tag ?? "-"} subject=${msg.subject}\n${msg.text}`);
      return { ok: true, provider };
    }
    if (provider === "resend") {
      const key = process.env.RESEND_API_KEY;
      if (!key) return { ok: false, provider, error: "RESEND_API_KEY is not set" };
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify({ from: from(), to: [msg.to], subject: msg.subject, text: msg.text, html: msg.html, tags: msg.tag ? [{ name: "type", value: msg.tag.replace(/[^A-Za-z0-9_-]/g, "_") }] : undefined }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) return { ok: false, provider, error: `resend ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}` };
      return { ok: true, provider };
    }
    if (provider === "smtp") return { ok: false, provider, error: "EMAIL_PROVIDER=smtp is not built in (nodemailer is not installed); use resend" };
    return { ok: false, provider: provider || "none", error: provider ? `unknown EMAIL_PROVIDER "${provider}"` : "email not configured (set EMAIL_PROVIDER)" };
  } catch (e) {
    return { ok: false, provider: provider || "none", error: (e as Error).message || "send failed" };
  }
}
