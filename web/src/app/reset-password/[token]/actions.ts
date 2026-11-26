"use server";
import { headers } from "next/headers";
import { rateLimitAsync } from "@/server/billing/rate-limit";
import { consumePasswordReset } from "@/server/security/password-reset";

export interface ResetState { done?: boolean; error?: string }

export async function resetPassword(token: string, _p: ResetState | null, fd: FormData): Promise<ResetState> {
  const pw = String(fd.get("password") ?? ""), again = String(fd.get("confirm") ?? "");
  if (pw !== again) return { error: "The two passwords do not match." };
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!(await rateLimitAsync(`reset:ip:${ip}`, 20, 60 * 60_000))) return { error: "Too many attempts. Try again later." };
  const r = await consumePasswordReset(token, pw);
  if (r.ok) return { done: true };
  return { error: r.reason === "weak" ? "Use at least 10 characters." : "This link is invalid or has expired. Request a new one." };
}
