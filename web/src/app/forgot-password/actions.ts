"use server";
import { headers } from "next/headers";
import { rateLimitAsync } from "@/server/billing/rate-limit";
import { requestPasswordReset } from "@/server/security/password-reset";

export interface ForgotState { done?: boolean; error?: string }

/** Always answers the same ("if that account exists...") so it cannot be used to discover accounts. */
export async function forgotPassword(_p: ForgotState | null, fd: FormData): Promise<ForgotState> {
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const store = String(fd.get("store") ?? "").trim() || null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return { error: "Enter a valid email address." };
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  const okIp = await rateLimitAsync(`forgot:ip:${ip}`, 10, 60 * 60_000);
  const okAcct = await rateLimitAsync(`forgot:acct:${email}`, 3, 60 * 60_000);
  if (okIp && okAcct) await requestPasswordReset(email, store).catch((e) => console.error("[forgot-password]", (e as Error).message));
  // rate limited requests get the same reply: no signal to an attacker either way
  return { done: true };
}
