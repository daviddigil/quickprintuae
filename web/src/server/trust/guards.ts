import "server-only";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { env } from "@/lib/env";
import { canonicalEmail, canonicalPhone, isDisposableEmail, nameSimilarity, SIMILAR_NAME_THRESHOLD } from "@/lib/trust/normalise";
import { GuardError, computeFlags, hashIp, normaliseTrn } from "@/lib/trust/verification";
import { recordTrustAudit } from "./audit";

export type BlockKind = "licence" | "email" | "phone" | "iban_hash" | "card_hash" | "name";

export async function isBlocked(kind: BlockKind, value: string | null | undefined): Promise<boolean> {
  if (!value) return false;
  const row = await db.query.blocklist.findFirst({ where: and(eq(schema.blocklist.kind, kind), eq(schema.blocklist.value, value)), columns: { id: true } });
  return !!row;
}

/** Owner email/phone must be unique platform-wide (one person = one shop owner account) and not blocklisted. */
export async function assertSignupAllowed(input: { email: string; phone: string }, opts: { exceptUserId?: string } = {}) {
  const email = canonicalEmail(input.email);
  const phone = canonicalPhone(input.phone);
  if (await isBlocked("email", email) || (phone && await isBlocked("phone", phone))) throw new GuardError("blocked");
  const emailRow = await db.query.users.findFirst({ where: and(eq(schema.users.role, "owner"), eq(schema.users.emailCanonical, email)), columns: { id: true } });
  if (emailRow && emailRow.id !== opts.exceptUserId) throw new GuardError("email_taken");
  if (phone) {
    const phoneRow = await db.query.users.findFirst({ where: and(eq(schema.users.role, "owner"), eq(schema.users.phoneCanonical, phone)), columns: { id: true } });
    if (phoneRow && phoneRow.id !== opts.exceptUserId) throw new GuardError("phone_taken");
  }
}

/** Licence, business name and TRN must not back another live (non-rejected) seller. */
export async function assertVerificationAllowed(tenantId: string, keys: { licenceNorm: string; nameNorm: string; trn?: string | null }) {
  if (await isBlocked("licence", keys.licenceNorm) || await isBlocked("name", keys.nameNorm)) throw new GuardError("blocked");
  const other = (col: typeof schema.sellerVerifications.licenceNumberNorm | typeof schema.sellerVerifications.legalNameNorm | typeof schema.sellerVerifications.trn, v: string) =>
    db.query.sellerVerifications.findFirst({ where: and(eq(col, v), ne(schema.sellerVerifications.tenantId, tenantId), ne(schema.sellerVerifications.status, "rejected")), columns: { id: true } });
  if (await other(schema.sellerVerifications.licenceNumberNorm, keys.licenceNorm)) throw new GuardError("licence_taken");
  if (await other(schema.sellerVerifications.legalNameNorm, keys.nameNorm)) throw new GuardError("name_taken");
  const trn = keys.trn ? normaliseTrn(keys.trn) : "";
  if (trn && await other(schema.sellerVerifications.trn, trn)) throw new GuardError("trn_taken");
}

/** Map a Postgres unique violation (races) to the friendly guard error. Returns null when it is something else. */
export function guardErrorFromDb(e: unknown): GuardError | null {
  const x = e as { constraint_name?: string; constraint?: string; message?: string; cause?: unknown };
  const c = (x?.cause ?? null) as { constraint_name?: string; constraint?: string; message?: string } | null;
  const text = [x?.constraint_name, x?.constraint, c?.constraint_name, c?.constraint, x?.message, c?.message].filter(Boolean).join(" ");
  if (/seller_verif_licence_idx/.test(text)) return new GuardError("licence_taken");
  if (/seller_verif_name_idx/.test(text)) return new GuardError("name_taken");
  if (/seller_verif_trn_idx/.test(text)) return new GuardError("trn_taken");
  if (/users_owner_email_canonical_idx/.test(text)) return new GuardError("email_taken");
  if (/users_owner_phone_canonical_idx/.test(text)) return new GuardError("phone_taken");
  return null;
}

/* ---------- review flags (never hard blocks) ---------- */
export const ipHashOf = (ip: string | null | undefined) => (ip ? hashIp(ip, env.authSecret) : null);

/** Remember a salted hash of the signup IP for this shop (privacy: the raw IP is not stored in the flag). */
export async function recordSignupIp(tenantId: string, ip: string | null | undefined) {
  const h = ipHashOf(ip);
  if (h) await recordTrustAudit("trust.signup_ip", { ipHash: h }, { tenantId });
}

export async function sharedIpTenants(tenantId: string): Promise<string[]> {
  const mine = await db.select({ meta: schema.auditLogs.meta }).from(schema.auditLogs)
    .where(and(eq(schema.auditLogs.action, "trust.signup_ip"), eq(schema.auditLogs.tenantId, tenantId)));
  const hashes = [...new Set(mine.map((r) => (r.meta as { ipHash?: string } | null)?.ipHash).filter((x): x is string => !!x))];
  if (!hashes.length) return [];
  const rows = await db.select({ tenantId: schema.auditLogs.tenantId }).from(schema.auditLogs)
    .where(and(eq(schema.auditLogs.action, "trust.signup_ip"), ne(schema.auditLogs.tenantId, tenantId), inArray(sql`${schema.auditLogs.meta}->>'ipHash'`, hashes)));
  return [...new Set(rows.map((r) => r.tenantId).filter((x): x is string => !!x))];
}

export async function similarVerifications(tenantId: string, nameNorm: string) {
  const rows = await db.select({ tenantId: schema.sellerVerifications.tenantId, norm: schema.sellerVerifications.legalNameNorm })
    .from(schema.sellerVerifications).where(and(ne(schema.sellerVerifications.tenantId, tenantId), ne(schema.sellerVerifications.status, "rejected"))).limit(5000);
  return rows.map((r) => ({ tenantId: r.tenantId, score: nameSimilarity(nameNorm, r.norm) })).filter((r) => r.score >= SIMILAR_NAME_THRESHOLD);
}

export async function hasCardReuseFlag(tenantId: string) {
  const r = await db.query.auditLogs.findFirst({ where: and(eq(schema.auditLogs.tenantId, tenantId), eq(schema.auditLogs.action, "trust.card_reuse")), columns: { id: true } });
  return !!r;
}

export async function computeReviewFlags(tenantId: string, ownerEmail: string, nameNorm: string): Promise<string[]> {
  const [similar, shared, cardReuse] = await Promise.all([similarVerifications(tenantId, nameNorm), sharedIpTenants(tenantId), hasCardReuseFlag(tenantId)]);
  return computeFlags({ disposableEmail: isDisposableEmail(ownerEmail), similar, sharedIpTenants: shared, cardReuse });
}

/** Other shops that match this verification on any key (for the superadmin side-by-side view). */
export async function duplicateMatches(v: { tenantId: string; licenceNumberNorm: string; legalNameNorm: string; trn: string | null }) {
  const rows = await db.select({ id: schema.sellerVerifications.id, tenantId: schema.sellerVerifications.tenantId, legalName: schema.sellerVerifications.legalName, licenceNumber: schema.sellerVerifications.licenceNumber,
    licenceNorm: schema.sellerVerifications.licenceNumberNorm, nameNorm: schema.sellerVerifications.legalNameNorm, trn: schema.sellerVerifications.trn, status: schema.sellerVerifications.status, shop: schema.tenants.name, slug: schema.tenants.slug })
    .from(schema.sellerVerifications).innerJoin(schema.tenants, eq(schema.tenants.id, schema.sellerVerifications.tenantId))
    .where(ne(schema.sellerVerifications.tenantId, v.tenantId)).limit(5000);
  const out: { id: string; tenantId: string; shop: string; slug: string; legalName: string; licenceNumber: string; status: string; reasons: string[] }[] = [];
  for (const r of rows) {
    const reasons: string[] = [];
    if (r.licenceNorm === v.licenceNumberNorm) reasons.push("same licence number");
    if (r.nameNorm === v.legalNameNorm) reasons.push("same business name");
    else if (nameSimilarity(r.nameNorm, v.legalNameNorm) >= SIMILAR_NAME_THRESHOLD) reasons.push("similar business name");
    if (v.trn && r.trn && normaliseTrn(r.trn) === normaliseTrn(v.trn)) reasons.push("same TRN");
    if (reasons.length) out.push({ id: r.id, tenantId: r.tenantId, shop: r.shop, slug: r.slug, legalName: r.legalName, licenceNumber: r.licenceNumber, status: r.status, reasons });
  }
  return out;
}

