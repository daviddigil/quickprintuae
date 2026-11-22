import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { env } from "./env";

export const SESSION_COOKIE = "qp_session";
const secret = () => new TextEncoder().encode(env.authSecret);

export type Role = "superadmin" | "owner" | "staff" | "customer";
export interface SessionPayload {
  uid: string;
  role: Role;
  tid: string | null;
  /** superadmin user id when impersonating a tenant user */
  imp?: string;
}

export const hashPassword = (p: string) => bcrypt.hash(p, 10);
export const verifyPassword = (p: string, h: string) => bcrypt.compare(p, h);

export async function createSession(p: SessionPayload) {
  const token = await new SignJWT({ ...p })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(p.imp ? "2h" : "30d")
    .sign(secret());
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/",
    maxAge: p.imp ? 2 * 3600 : 30 * 86400,
  });
}

export async function destroySession() {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function getSession(): Promise<SessionPayload | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

/** Session + fresh user row (ensures deactivated users are locked out). */
export async function getCurrentUser() {
  const s = await getSession();
  if (!s) return null;
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, s.uid) });
  if (!user || !user.active) return null;
  return { session: s, user };
}

/** Guard for the store admin panel: owner or staff of a tenant (incl. impersonated). */
export async function requireStaff(opts: { ownerOnly?: boolean } = {}) {
  const cu = await getCurrentUser();
  if (!cu || !cu.session.tid || !["owner", "staff"].includes(cu.user.role)) redirect("/login?next=/admin");
  if (opts.ownerOnly && cu.user.role !== "owner") redirect("/admin?error=forbidden");
  const tenant = await db.query.tenants.findFirst({ where: eq(schema.tenants.id, cu.session.tid!) });
  if (!tenant) redirect("/login");
  return { ...cu, tenant };
}

export async function requireSuperadmin() {
  const cu = await getCurrentUser();
  if (!cu || cu.user.role !== "superadmin") redirect("/login?next=/superadmin");
  return cu;
}

/** Customer of a given storefront tenant, or null. */
export async function getCustomer(tenantId: string) {
  const cu = await getCurrentUser();
  if (!cu || cu.user.role !== "customer" || cu.session.tid !== tenantId) return null;
  return cu.user;
}
