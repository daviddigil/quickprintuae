import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createHash } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { getSession, getCurrentUser, SESSION_COOKIE, verifyPassword } from "@/lib/auth";
import { env } from "@/lib/env";
import { rateLimitAsync } from "@/server/billing/rate-limit";
import { audit } from "@/lib/audit";
import { STEP_UP_MAX_AGE_MS } from "./policy";
import { verifySecondFactor } from "./twofactor";

/**
 * STEP-UP AUTH for sensitive actions (gateway key changes, IBAN reveal, payout approval, disabling 2FA ...).
 *
 * PUBLIC API (stable):
 *   await requireStepUp({ next?, maxAgeMs?, mode? })   in a server action / page / route handler, BEFORE the sensitive work.
 *        - fresh grant (default 10 min)  -> returns
 *        - otherwise mode "redirect" (default) -> redirect("/login/step-up?next=<path>") ; the user enters a TOTP/recovery code
 *          (or their password when 2FA is not enabled) and is sent back to `next` to repeat the action.
 *        - mode "throw" -> throws StepUpRequiredError (code "STEP_UP_REQUIRED") so a client can open <StepUpPrompt>.
 *   await isSteppedUp(maxAgeMs?)                       boolean, never redirects.
 *   await stepUpMethod()                               "totp" | "password" for the signed-in user.
 *   <StepUpPrompt onVerified={() => ...} />            client component (src/components/security/StepUpPrompt.tsx)
 *
 * The grant is a signed httpOnly cookie bound to the user AND to the current session token, so logging out or in
 * again discards it. Impersonation sessions can never step up.
 */
export const STEP_UP_COOKIE = "qp_stepup";
const secret = () => new TextEncoder().encode(`stepup:${env.authSecret}`);

export class StepUpRequiredError extends Error {
  readonly code = "STEP_UP_REQUIRED";
  constructor(public readonly method: "totp" | "password") { super("Step-up verification required"); }
}
export const isStepUpRequired = (e: unknown): e is StepUpRequiredError => e instanceof StepUpRequiredError || (e as { code?: string })?.code === "STEP_UP_REQUIRED";

const sessionBind = async () => {
  const t = (await cookies()).get(SESSION_COOKIE)?.value ?? "";
  return createHash("sha256").update(t).digest("hex").slice(0, 24);
};

export async function stepUpMethod(): Promise<"totp" | "password"> {
  const cu = await getCurrentUser();
  return cu?.user.totpEnabledAt ? "totp" : "password";
}

export async function isSteppedUp(maxAgeMs = STEP_UP_MAX_AGE_MS): Promise<boolean> {
  const s = await getSession();
  if (!s || s.imp) return false;
  const raw = (await cookies()).get(STEP_UP_COOKIE)?.value;
  if (!raw) return false;
  try {
    const { payload } = await jwtVerify(raw, secret());
    return payload.uid === s.uid && payload.sb === (await sessionBind()) && typeof payload.at === "number" && Date.now() - payload.at <= maxAgeMs;
  } catch { return false; }
}

async function grant() {
  const s = await getSession();
  if (!s) return;
  const token = await new SignJWT({ uid: s.uid, sb: await sessionBind(), at: Date.now() }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("1h").sign(secret());
  (await cookies()).set(STEP_UP_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 3600 });
}

/** Safe same-site path for the redirect target. */
export const safeNext = (n: string | null | undefined) => (n && n.startsWith("/") && !n.startsWith("//") && !n.includes("\\") ? n : "/");

export async function requireStepUp(opts: { next?: string; maxAgeMs?: number; mode?: "redirect" | "throw" } = {}): Promise<void> {
  if (await isSteppedUp(opts.maxAgeMs)) return;
  const method = await stepUpMethod();
  if (opts.mode === "throw") throw new StepUpRequiredError(method);
  let next = opts.next;
  if (!next) {
    const ref = (await headers()).get("referer");
    try { if (ref) { const u = new URL(ref); next = u.pathname + u.search; } } catch { /* ignore */ }
  }
  redirect(`/login/step-up?next=${encodeURIComponent(safeNext(next))}`);
}

/** Checks the credential and, if good, records the grant. Used by the step-up page/server action. */
export async function verifyStepUp(input: string): Promise<{ ok: boolean; error?: string }> {
  const cu = await getCurrentUser();
  if (!cu || cu.session.imp) return { ok: false, error: "Sign in again to continue." };
  if (!(await rateLimitAsync(`stepup:${cu.user.id}`, 5, 10 * 60_000))) return { ok: false, error: "Too many attempts. Wait a few minutes and try again." };
  const ok = cu.user.totpEnabledAt ? !!(await verifySecondFactor(cu.user, input)) : await verifyPassword(input, cu.user.passwordHash);
  if (!ok) {
    await audit("security.stepup_failed", { userId: cu.user.id }, cu.user.tenantId);
    return { ok: false, error: cu.user.totpEnabledAt ? "That code is not valid." : "That password is not correct." };
  }
  await grant();
  await audit("security.stepup_ok", { userId: cu.user.id }, cu.user.tenantId);
  return { ok: true };
}
