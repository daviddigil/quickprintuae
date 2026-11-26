import "server-only";
import { createHash } from "crypto";
import { and, eq, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import type { PayoutAccount } from "@/db/schema";
import { decrypt, encrypt } from "@/lib/crypto";
import { cleanIban, validateUaeIban } from "@/lib/trust/iban";
import { normaliseBusinessName, nameSimilarity, SIMILAR_NAME_THRESHOLD } from "@/lib/trust/normalise";

/** Payouts are blocked this long after bank details are saved or changed. */
export const PAYOUT_HOLD_MS = 48 * 3600_000;
export const ibanHash = (iban: string) => createHash("sha256").update(cleanIban(iban)).digest("hex");

export interface PayoutAccountInput { holderName: string; bankName: string; iban: string; accountNumber?: string; swift?: string }
export type SaveResult = { ok: true; changed: boolean; warning?: string; holdUntil: Date | null } | { ok: false; error: string };

const SWIFT = /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/;

/**
 * Create or change a shop's payout account. The caller has already re-verified the owner's password.
 * Any real change sets status 'pending_review', blocks payouts for 48 h, and is written to the account's history.
 */
export async function savePayoutAccount(tenantId: string, actorId: string, input: PayoutAccountInput, now = new Date()): Promise<SaveResult> {
  const holder = input.holderName.trim().replace(/\s+/g, " ");
  const bank = input.bankName.trim();
  const acct = (input.accountNumber ?? "").replace(/[\s-]/g, "");
  const swift = (input.swift ?? "").replace(/\s/g, "").toUpperCase();
  if (holder.length < 3 || holder.length > 120) return { ok: false, error: "Enter the account holder name exactly as it appears at the bank (3 to 120 characters)" };
  if (bank.length < 2 || bank.length > 80) return { ok: false, error: "Choose your bank" };
  const iban = validateUaeIban(input.iban);
  if (!iban.ok) return { ok: false, error: iban.error };
  if (acct && !/^\d{6,20}$/.test(acct)) return { ok: false, error: "The account number should be 6 to 20 digits" };
  if (swift && !SWIFT.test(swift)) return { ok: false, error: "The SWIFT/BIC code should be 8 or 11 letters and digits" };

  const hash = ibanHash(iban.iban);
  const blocked = await db.query.blocklist.findFirst({ where: and(eq(schema.blocklist.kind, "iban_hash"), eq(schema.blocklist.value, hash)) });
  if (blocked) return { ok: false, error: "This bank account cannot be used. Contact QuickPrint support." };
  const taken = await db.query.payoutAccounts.findFirst({ where: and(eq(schema.payoutAccounts.ibanHash, hash), ne(schema.payoutAccounts.tenantId, tenantId), ne(schema.payoutAccounts.status, "rejected")) });
  if (taken) return { ok: false, error: "This IBAN is already registered to another shop. One bank account can only serve one shop. Contact support if this is a mistake." };

  const current = await db.query.payoutAccounts.findFirst({ where: eq(schema.payoutAccounts.tenantId, tenantId) });
  const currentAcct = current?.accountNumberEnc ? safeDecrypt(current.accountNumberEnc) : "";
  const unchanged = !!current && current.status !== "rejected" && current.ibanHash === hash && current.accountHolderName === holder && current.bankName === bank
    && (current.swift ?? "") === swift && (currentAcct ?? "") === acct;
  if (unchanged) return { ok: true, changed: false, holdUntil: (await db.query.tenants.findFirst({ where: eq(schema.tenants.id, tenantId) }))?.payoutHoldUntil ?? null };

  const changedFields = current ? [
    current.ibanHash !== hash && "IBAN", current.accountHolderName !== holder && "account holder", current.bankName !== bank && "bank",
    (current.swift ?? "") !== swift && "SWIFT", (currentAcct ?? "") !== acct && "account number",
  ].filter(Boolean).join(", ") : "";
  const entry = { at: now.toISOString(), by: actorId, action: current ? "changed" : "created", note: current ? `changed: ${changedFields || "details"}; IBAN ends ${iban.last4}` : `IBAN ends ${iban.last4}` };
  const holdUntil = new Date(now.getTime() + PAYOUT_HOLD_MS);
  const values = {
    accountHolderName: holder, bankName: bank, ibanEnc: encrypt(iban.iban), ibanLast4: iban.last4, ibanHash: hash,
    accountNumberEnc: acct ? encrypt(acct) : null, swift: swift || null, status: "pending_review", reason: null, verifiedBy: null, verifiedAt: null, updatedAt: now,
  };
  try {
    await db.transaction(async (tx) => {
      if (current) await tx.update(schema.payoutAccounts).set({ ...values, history: [...(current.history ?? []), entry] }).where(eq(schema.payoutAccounts.id, current.id));
      else await tx.insert(schema.payoutAccounts).values({ tenantId, ...values, history: [entry] });
      await tx.update(schema.tenants).set({ payoutHoldUntil: holdUntil, payoutAccountName: holder, payoutIbanLast4: iban.last4 }).where(eq(schema.tenants.id, tenantId));
    });
  } catch (e) {
    if ((e as { code?: string; cause?: { code?: string } })?.code === "23505" || (e as { cause?: { code?: string } })?.cause?.code === "23505")
      return { ok: false, error: "This IBAN is already registered to another shop. One bank account can only serve one shop." };
    throw e;
  }
  return { ok: true, changed: true, holdUntil, warning: await holderWarning(tenantId, holder) };
}

const safeDecrypt = (v: string) => { try { return decrypt(v); } catch { return ""; } };

/** Soft warning only: the holder name should resemble the licensed business name. */
export async function holderWarning(tenantId: string, holder: string): Promise<string | undefined> {
  const v = await db.query.sellerVerifications.findFirst({ where: eq(schema.sellerVerifications.tenantId, tenantId) });
  if (!v) return undefined;
  const sim = nameSimilarity(normaliseBusinessName(holder), normaliseBusinessName(v.legalName));
  return sim < SIMILAR_NAME_THRESHOLD ? `The account holder name does not closely match your licensed business name (${v.legalName}). Payouts normally go to an account in the business's name; QuickPrint may ask you to confirm.` : undefined;
}

/** Superadmin decision on a pending payout account. */
export async function reviewPayoutAccount(accountId: string, reviewerId: string, decision: "verified" | "rejected", reason?: string, now = new Date()) {
  const acc = await db.query.payoutAccounts.findFirst({ where: eq(schema.payoutAccounts.id, accountId) });
  if (!acc) return { ok: false as const, error: "Account not found" };
  if (acc.status !== "pending_review") return { ok: false as const, error: `This account is already ${acc.status.replace("_", " ")}` };
  if (decision === "rejected" && !reason?.trim()) return { ok: false as const, error: "Give the shop a reason for rejecting" };
  const entry = { at: now.toISOString(), by: reviewerId, action: decision === "verified" ? "approved" : "rejected", note: reason?.trim() || undefined };
  await db.update(schema.payoutAccounts).set({
    status: decision, reason: decision === "rejected" ? reason!.trim() : null, verifiedBy: reviewerId, verifiedAt: now, updatedAt: now, history: [...(acc.history ?? []), entry],
  }).where(eq(schema.payoutAccounts.id, accountId));
  return { ok: true as const, tenantId: acc.tenantId };
}

/** Full IBAN for the audited reveal / bank export. Callers must audit and step-up first. */
export const revealIban = (acc: Pick<PayoutAccount, "ibanEnc">) => decrypt(acc.ibanEnc) ?? "";
