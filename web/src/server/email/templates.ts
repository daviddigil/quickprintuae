/**
 * Transactional email templates (HTML + plain text). Pure functions returning { subject, text, html } so other
 * features call e.g. `sendEmail({ to, tag: "payout.paid", ...payoutPaidEmail({...}) })`.
 * Brand (docs/BRAND.md): navy #1D1E3A, teal #00FFCC (accents only, never as text on white), magenta #FF007F, royal blue #3300FF.
 */
export interface Rendered { subject: string; text: string; html: string }

export const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const safeUrl = (u: string) => (/^https?:\/\//i.test(u) ? u : "#");

/** Layout wrapper: table-based, inline styles, 600px, works in Gmail/Outlook. `bodyHtml` must already be escaped. */
export function layout(opts: { title: string; bodyHtml: string; preheader?: string; footerNote?: string }): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(opts.title)}</title></head>
<body style="margin:0;background:#f4f5f9;font-family:Arial,Helvetica,sans-serif;color:#1D1E3A">
<span style="display:none;max-height:0;overflow:hidden">${esc(opts.preheader ?? "")}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f9;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden">
<tr><td style="background:#1D1E3A;padding:20px 28px"><span style="font-size:20px;font-weight:800;letter-spacing:.5px;color:#ffffff">QUICKPRINT</span> <span style="font-size:12px;font-weight:700;color:#00FFCC">UAE</span></td></tr>
<tr><td style="height:4px;background:linear-gradient(90deg,#00FFCC,#FF007F,#3300FF)"></td></tr>
<tr><td style="padding:28px;font-size:16px;line-height:1.6">${opts.bodyHtml}</td></tr>
<tr><td style="padding:16px 28px 24px;font-size:12px;line-height:1.5;color:#5b5d7a;border-top:1px solid #e6e7f0">${esc(opts.footerNote ?? "You are receiving this because of activity on your QuickPrint account.")}<br>Powered by Nexsofture Tech</td></tr>
</table></td></tr></table></body></html>`;
}

const h1 = (t: string) => `<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#1D1E3A">${esc(t)}</h1>`;
const p = (t: string) => `<p style="margin:0 0 16px">${esc(t)}</p>`;
const button = (label: string, url: string) => `<p style="margin:24px 0"><a href="${esc(safeUrl(url))}" style="display:inline-block;background:#3300FF;color:#ffffff;text-decoration:none;font-weight:700;padding:14px 24px;border-radius:8px;min-height:44px">${esc(label)}</a></p><p style="margin:0 0 16px;font-size:13px;color:#5b5d7a">If the button does not work, copy this link into your browser:<br><span style="word-break:break-all">${esc(url)}</span></p>`;

export function passwordResetEmail(o: { name?: string; url: string; minutes?: number }): Rendered {
  const m = o.minutes ?? 60;
  const hi = o.name ? `Hi ${o.name},` : "Hi,";
  return {
    subject: "Reset your QuickPrint password",
    text: `${hi}\n\nWe received a request to reset your QuickPrint password. Open this link within ${m} minutes to choose a new one:\n\n${o.url}\n\nIf you did not ask for this, ignore this email: your password stays the same.\n\nQuickPrint UAE`,
    html: layout({ title: "Reset your password", preheader: "Use this link to choose a new password", bodyHtml: h1("Reset your password") + p(hi) + p(`We received a request to reset your QuickPrint password. The link below works once and expires in ${m} minutes.`) + button("Choose a new password", o.url) + p("If you did not ask for this, you can ignore this email: your password stays the same.") }),
  };
}

export type VerificationDecision = "approved" | "rejected" | "needs_info";
export function verificationEmail(o: { decision: VerificationDecision; businessName: string; reason?: string; url: string }): Rendered {
  const t = {
    approved: { subject: "Your shop is verified", head: "You're verified", line: `Good news: ${o.businessName} has been verified. Live card payments, payouts and the Live stores directory are now available to your shop.`, cta: "Open your dashboard" },
    rejected: { subject: "Your verification was not approved", head: "Verification not approved", line: `We could not approve the verification for ${o.businessName}.${o.reason ? ` Reason: ${o.reason}` : ""} You can correct the details and submit again.`, cta: "Review and resubmit" },
    needs_info: { subject: "We need a little more information", head: "More information needed", line: `To finish verifying ${o.businessName} we need something more.${o.reason ? ` ${o.reason}` : ""}`, cta: "Provide the details" },
  }[o.decision];
  return {
    subject: t.subject,
    text: `${t.head}\n\n${t.line}\n\n${t.cta}: ${o.url}\n\nQuickPrint UAE`,
    html: layout({ title: t.head, preheader: t.line.slice(0, 90), bodyHtml: h1(t.head) + p(t.line) + button(t.cta, o.url) }),
  };
}

export function payoutPaidEmail(o: { shopName: string; amount: number; currency?: string; reference: string; periodLabel?: string; url: string }): Rendered {
  const amt = `${o.currency ?? "AED"} ${o.amount.toFixed(2)}`;
  const line = `We have sent a payout of ${amt} to your registered bank account${o.periodLabel ? ` for ${o.periodLabel}` : ""}. Bank reference: ${o.reference}. It usually arrives within 1 to 2 working days.`;
  return {
    subject: `Payout of ${amt} sent`,
    text: `Hi ${o.shopName},\n\n${line}\n\nSee the statement: ${o.url}\n\nQuickPrint UAE`,
    html: layout({ title: "Payout sent", preheader: `${amt} is on its way`, bodyHtml: h1("Your payout is on its way") + p(`Hi ${o.shopName},`) + p(line) + button("View statement", o.url) }),
  };
}

export function quoteReceivedEmail(o: { shopName: string; customerName: string; customerContact?: string; summary: string; url: string }): Rendered {
  const line = `${o.customerName} asked for a quote${o.customerContact ? ` (${o.customerContact})` : ""}: ${o.summary}`;
  return {
    subject: `New quote request from ${o.customerName}`,
    text: `Hi ${o.shopName},\n\n${line}\n\nReply from your dashboard: ${o.url}\n\nQuickPrint UAE`,
    html: layout({ title: "New quote request", preheader: line.slice(0, 90), bodyHtml: h1("New quote request") + p(`Hi ${o.shopName},`) + p(line) + button("Open the request", o.url) }),
  };
}
