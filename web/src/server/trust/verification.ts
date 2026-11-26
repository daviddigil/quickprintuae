import "server-only";
import { and, desc, eq, lt, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { SellerVerification, Tenant } from "@/db/schema";
import { normaliseBusinessName, normaliseLicence } from "@/lib/trust/normalise";
import { GuardError, MAX_DOCUMENT_BYTES, authorityLabel, mergeFlags, normaliseTrn, sniffDocument, type VerificationInputT } from "@/lib/trust/verification";
import { sendEmail } from "@/server/email";
import { deleteFile, putFile } from "@/server/storage";
import { assertVerificationAllowed, computeReviewFlags, guardErrorFromDb } from "./guards";
import { recordTrustAudit } from "./audit";
import { env } from "@/lib/env";

export type VerificationStatus = "pending_review" | "needs_info" | "verified" | "rejected" | "expired";
type HistoryEntry = SellerVerification["history"][number];

/** tenants.verificationStatus that goes with each review status ('needs_info' is not verified, and needs owner action) */
export const tenantStatusFor = (s: VerificationStatus): string => (s === "pending_review" ? "pending_review" : s === "needs_info" ? "unverified" : s);

export class VerificationError extends Error {}

export const getVerification = (tenantId: string) => db.query.sellerVerifications.findFirst({ where: eq(schema.sellerVerifications.tenantId, tenantId) });

const hist = (by: string | null, status: string, note?: string): HistoryEntry => ({ at: new Date().toISOString(), by, status, ...(note ? { note } : {}) });

async function notifyOwner(tenantId: string, tag: string, subject: string, text: string) {
  const owner = await db.query.users.findFirst({ where: and(eq(schema.users.tenantId, tenantId), eq(schema.users.role, "owner")) });
  if (!owner) return;
  await sendEmail({ to: owner.email, subject, text: `${text}\n\n${env.appUrl}/admin/verification\n\nQuickPrint`, tag }).catch(() => {});
}

/** Owner submits (or resubmits) the licence details. Throws GuardError / VerificationError with a friendly message. */
export async function submitVerification(a: { tenant: Tenant; ownerId: string; ownerEmail: string; input: VerificationInputT; file: Buffer | null; ip?: string | null }) {
  const { tenant, input } = a;
  const existing = await getVerification(tenant.id);
  if (existing?.status === "verified") throw new VerificationError("Your business is already verified.");
  let doc: { ext: ".pdf" | ".jpg" | ".png" } | null = null;
  if (a.file) {
    if (a.file.length > MAX_DOCUMENT_BYTES) throw new VerificationError("The document is larger than 8 MB. Upload a smaller PDF, JPG or PNG.");
    doc = sniffDocument(a.file);
    if (!doc) throw new VerificationError("Upload the trade licence as a PDF, JPG or PNG file.");
  } else if (!existing?.documentKey) throw new VerificationError("Upload a copy of your trade licence (PDF, JPG or PNG, up to 8 MB).");

  const licenceNorm = normaliseLicence(input.licenceNumber);
  const nameNorm = normaliseBusinessName(input.legalName);
  if (licenceNorm.length < 3 || nameNorm.length < 2) throw new VerificationError("Check the licence number and business name.");
  const trn = input.trn ? normaliseTrn(input.trn) : null;
  await assertVerificationAllowed(tenant.id, { licenceNorm, nameNorm, trn });
  const flags = await computeReviewFlags(tenant.id, a.ownerEmail, nameNorm);

  const newKey = a.file && doc ? await putFile(tenant.id, a.file, doc.ext, true) : null;
  const values = {
    legalName: input.legalName, legalNameNorm: nameNorm, licenceNumber: input.licenceNumber, licenceNumberNorm: licenceNorm,
    authority: authorityLabel(input.authority, input.authorityDetail), licenceExpiry: new Date(`${input.licenceExpiry}T23:59:59+04:00`),
    activity: input.activity, signatoryName: input.signatoryName, trn, documentKey: newKey ?? existing?.documentKey ?? null,
    status: "pending_review" as const, reason: null, flags, reviewerId: null, reviewedAt: null, submittedAt: new Date(),
  };
  const entry = hist(a.ownerId, "pending_review", existing ? "Resubmitted by the owner" : "Submitted by the owner");
  try {
    await db.transaction(async (tx) => {
      if (existing) await tx.update(schema.sellerVerifications).set({ ...values, history: [...existing.history, entry] }).where(eq(schema.sellerVerifications.id, existing.id));
      else await tx.insert(schema.sellerVerifications).values({ ...values, tenantId: tenant.id, history: [entry] });
      await tx.update(schema.tenants).set({ verificationStatus: "pending_review" }).where(eq(schema.tenants.id, tenant.id));
    });
  } catch (e) {
    if (newKey) await deleteFile(newKey);
    const g = guardErrorFromDb(e);
    if (g) throw g;
    throw e;
  }
  if (newKey && existing?.documentKey && existing.documentKey !== newKey) await deleteFile(existing.documentKey);
  await recordTrustAudit("verification.submitted", { flags, resubmission: !!existing }, { tenantId: tenant.id, actorId: a.ownerId, ip: a.ip });
  await notifyOwner(tenant.id, "verification.received", "We received your business details", "Thanks. Your trade licence is in the review queue. We usually reply within 1 to 2 working days.");
}

export interface ReviewArgs {
  id: string;
  action: "approve" | "reject" | "needs_info";
  note?: string;
  reviewerId: string;
  /** required to approve while review flags are open */
  overrideReason?: string;
  /** on reject: also add the licence number and business name to the blocklist */
  block?: boolean;
}

export async function reviewVerification(a: ReviewArgs): Promise<VerificationStatus> {
  const v = await db.query.sellerVerifications.findFirst({ where: eq(schema.sellerVerifications.id, a.id) });
  if (!v) throw new VerificationError("Verification not found.");
  const tenant = await db.query.tenants.findFirst({ where: eq(schema.tenants.id, v.tenantId) });
  if (!tenant) throw new VerificationError("Shop not found.");
  const note = (a.note ?? "").trim();
  const now = new Date();

  if (a.action === "approve") {
    if (v.status === "verified") return "verified";
    if (tenant.cardStatus !== "on_file") throw new VerificationError("The owner has no card on file yet. Approve after the card is added.");
    if (v.licenceExpiry && v.licenceExpiry <= now) throw new VerificationError("The licence has expired. Ask the owner to resubmit a current licence.");
    const open = v.flags.filter((f) => !f.startsWith("override"));
    const reason = (a.overrideReason ?? "").trim();
    if (open.length && reason.length < 10) throw new VerificationError("This submission has review flags. Write the reason for approving anyway (at least 10 characters).");
    const flags = open.length ? mergeFlags(v.flags, ["override"]) : v.flags;
    const entries = [hist(a.reviewerId, "verified", note || undefined)];
    if (open.length) entries.unshift(hist(a.reviewerId, "override", `Approved despite flags (${open.join(", ")}): ${reason}`));
    await db.transaction(async (tx) => {
      await tx.update(schema.sellerVerifications).set({ status: "verified", reason: null, flags, reviewerId: a.reviewerId, reviewedAt: now, history: [...v.history, ...entries] }).where(eq(schema.sellerVerifications.id, v.id));
      await tx.update(schema.tenants).set({ verificationStatus: "verified", legalName: v.legalName, trn: v.trn ?? tenant.trn }).where(eq(schema.tenants.id, v.tenantId));
    });
    if (open.length) await recordTrustAudit("trust.override", { guard: "review_flags", flags: open, reason }, { tenantId: v.tenantId, actorId: a.reviewerId });
    await recordTrustAudit("verification.approved", { note }, { tenantId: v.tenantId, actorId: a.reviewerId });
    await notifyOwner(v.tenantId, "verification.approved", "Your business is verified", "Good news: your business is verified. Your store is open for live orders and appears in the Live stores directory.");
    invalidateDirectoryCache();
    return "verified";
  }

  if (note.length < 5) throw new VerificationError(a.action === "reject" ? "Write the reason for rejecting (the owner will see it)." : "Write what the owner needs to send (the owner will see it).");
  const status: VerificationStatus = a.action === "reject" ? "rejected" : "needs_info";
  await db.transaction(async (tx) => {
    await tx.update(schema.sellerVerifications).set({ status, reason: note, reviewerId: a.reviewerId, reviewedAt: now, history: [...v.history, hist(a.reviewerId, status, note)] }).where(eq(schema.sellerVerifications.id, v.id));
    await tx.update(schema.tenants).set({ verificationStatus: tenantStatusFor(status) }).where(eq(schema.tenants.id, v.tenantId));
    if (status === "rejected" && a.block) {
      await tx.insert(schema.blocklist).values([
        { kind: "licence", value: v.licenceNumberNorm, reason: note, createdBy: a.reviewerId },
        { kind: "name", value: v.legalNameNorm, reason: note, createdBy: a.reviewerId },
      ]).onConflictDoNothing();
    }
  });
  await recordTrustAudit(status === "rejected" ? "verification.rejected" : "verification.needs_info", { note, blocked: !!a.block }, { tenantId: v.tenantId, actorId: a.reviewerId });
  await notifyOwner(v.tenantId, `verification.${status}`, status === "rejected" ? "Your business verification was not approved" : "We need more information to verify your business",
    status === "rejected" ? `We could not approve your business details.\n\nReason: ${note}\n\nYou can correct them and submit again.` : `We need a little more information.\n\n${note}\n\nPlease update your details and submit again.`);
  invalidateDirectoryCache();
  return status;
}

function invalidateDirectoryCache() {
  const g = globalThis as unknown as { __qpDirectory?: unknown };
  g.__qpDirectory = undefined;
}

/** Superadmin removes a blocklist entry: written reason required, audited. */
export async function removeBlocklistEntry(a: { id: string; reason: string; actorId: string }) {
  if (a.reason.trim().length < 10) throw new VerificationError("Write the reason for removing this block (at least 10 characters).");
  const [row] = await db.delete(schema.blocklist).where(eq(schema.blocklist.id, a.id)).returning();
  if (row) await recordTrustAudit("trust.override", { guard: "blocklist_removed", kind: row.kind, reason: a.reason.trim() }, { actorId: a.actorId });
}

/**
 * Licence expiry: mark verified shops whose licence date has passed as 'expired' (payouts stop, shop leaves the directory)
 * and email a warning 30 days before. Idempotent; call daily from cron.
 */
export async function runLicenceExpirySweep(now = new Date()) {
  const expired = await db.query.sellerVerifications.findMany({ where: and(eq(schema.sellerVerifications.status, "verified"), lt(schema.sellerVerifications.licenceExpiry, now)) });
  for (const v of expired) {
    await db.transaction(async (tx) => {
      await tx.update(schema.sellerVerifications).set({ status: "expired", history: [...v.history, hist(null, "expired", "Licence expiry date passed")] }).where(eq(schema.sellerVerifications.id, v.id));
      await tx.update(schema.tenants).set({ verificationStatus: "expired" }).where(eq(schema.tenants.id, v.tenantId));
    });
    await recordTrustAudit("verification.expired", { licenceExpiry: v.licenceExpiry }, { tenantId: v.tenantId });
    await notifyOwner(v.tenantId, "verification.expired", "Your trade licence has expired", "Your trade licence has expired, so live orders, payouts and your directory listing are paused. Upload your renewed licence to continue.");
  }
  const soon = new Date(now.getTime() + 30 * 86400_000);
  const dueRows = await db.query.sellerVerifications.findMany({ where: and(eq(schema.sellerVerifications.status, "verified"), lt(schema.sellerVerifications.licenceExpiry, soon), sql`${schema.sellerVerifications.licenceExpiry} >= ${now.toISOString()}::timestamptz`) });
  let warned = 0;
  for (const v of dueRows) {
    if (v.history.some((h) => h.status === "expiry_warning")) continue;
    await db.update(schema.sellerVerifications).set({ history: [...v.history, hist(null, "expiry_warning", "30-day expiry warning sent")] }).where(eq(schema.sellerVerifications.id, v.id));
    await notifyOwner(v.tenantId, "verification.expiry_warning", "Your trade licence expires soon", `Your trade licence expires on ${v.licenceExpiry?.toISOString().slice(0, 10)}. Upload the renewed licence before then to keep payouts and your store listing active.`);
    warned++;
  }
  if (expired.length) invalidateDirectoryCache();
  return { expired: expired.length, warned };
}

/** Superadmin queue helpers */
export const QUEUE_STATUSES: VerificationStatus[] = ["pending_review", "needs_info", "verified", "rejected", "expired"];
export async function listVerifications(status: VerificationStatus) {
  return db.select({ v: schema.sellerVerifications, shop: schema.tenants.name, slug: schema.tenants.slug, tenantStatus: schema.tenants.status })
    .from(schema.sellerVerifications).innerJoin(schema.tenants, eq(schema.tenants.id, schema.sellerVerifications.tenantId))
    .where(eq(schema.sellerVerifications.status, status)).orderBy(status === "pending_review" ? schema.sellerVerifications.submittedAt : desc(schema.sellerVerifications.submittedAt)).limit(500);
}
export const slaHours = (submittedAt: Date, now = new Date()) => Math.floor((now.getTime() - submittedAt.getTime()) / 3600_000);
export { GuardError };

/** Signups that never added a card (status 'incomplete') are removed after `days`, freeing the email, phone and store address. */
export async function purgeAbandonedSignups(days = 7, now = new Date()) {
  const cutoff = new Date(now.getTime() - days * 86400_000);
  const rows = await db.delete(schema.tenants).where(and(eq(schema.tenants.status, "incomplete"), lt(schema.tenants.createdAt, cutoff))).returning({ id: schema.tenants.id });
  return rows.length;
}
