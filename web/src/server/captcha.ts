import "server-only";

/**
 * Cloudflare Turnstile verification. OFF unless TURNSTILE_SECRET_KEY is set (dev, tests and pre-launch stay unchanged).
 * When configured it is fail-closed: a missing token, a rejected token, a non-200 reply, a network error or a timeout all refuse the request.
 */
export const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export type CaptchaResult = { ok: true; skipped?: boolean } | { ok: false; message: string };
const REFUSED = "Please complete the security check and try again.";

export const captchaConfigured = () => !!process.env.TURNSTILE_SECRET_KEY;

export async function verifyTurnstile(
  token: string | null | undefined,
  ip?: string | null,
  opts: { secret?: string; fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<CaptchaResult> {
  const secret = opts.secret ?? process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return { ok: true, skipped: true };
  if (!token || typeof token !== "string") return { ok: false, message: REFUSED };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 5000);
  try {
    const body = new URLSearchParams({ secret, response: token });
    if (ip) body.set("remoteip", ip);
    const res = await (opts.fetchImpl ?? fetch)(TURNSTILE_VERIFY_URL, { method: "POST", body, signal: ctrl.signal });
    if (!res.ok) return { ok: false, message: REFUSED };
    const data = (await res.json().catch(() => ({}))) as { success?: boolean };
    return data.success === true ? { ok: true } : { ok: false, message: REFUSED };
  } catch {
    return { ok: false, message: REFUSED };
  } finally {
    clearTimeout(timer);
  }
}
