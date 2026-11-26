import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { env } from "@/lib/env";

/** Short-lived "password verified, second factor pending" cookie. It is NOT a session. */
export const CHALLENGE_COOKIE = "qp_2fa";
const secret = () => new TextEncoder().encode(`2fa:${env.authSecret}`);

export async function setChallenge(uid: string) {
  const token = await new SignJWT({ uid }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("5m").sign(secret());
  (await cookies()).set(CHALLENGE_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/api/v1/auth", maxAge: 300 });
}
export async function readChallenge(): Promise<string | null> {
  const raw = (await cookies()).get(CHALLENGE_COOKIE)?.value;
  if (!raw) return null;
  try { return String((await jwtVerify(raw, secret())).payload.uid); } catch { return null; }
}
export async function clearChallenge() { (await cookies()).set(CHALLENGE_COOKIE, "", { path: "/api/v1/auth", maxAge: 0 }); }
