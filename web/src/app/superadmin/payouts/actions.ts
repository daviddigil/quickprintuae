"use server";
import { redirect } from "next/navigation";
import { requireSuperadmin, verifyPassword } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";
import { formatIban } from "@/lib/trust/iban";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { reviewPayoutAccount, revealIban } from "@/server/payouts/account";
import { approveBatch, cancelBatch, createBatch, markBatchPaid, superadminCount } from "@/server/payouts/batches";
import { stepUpForMoney } from "@/server/payouts/stepup";

const str = (fd: FormData, k: string) => (fd.get(k) ?? "").toString().trim();
const go = (path: string, msg: string, err?: boolean): never => redirect(`${path}${path.includes("?") ? "&" : "?"}${err ? "error" : "ok"}=${encodeURIComponent(msg)}`);

export async function reviewAccountAction(fd: FormData) {
  const { user } = await requireSuperadmin();
  const decision = str(fd, "decision") === "approve" ? "verified" : "rejected";
  const r = await reviewPayoutAccount(str(fd, "accountId"), user.id, decision, str(fd, "reason"));
  if (!r.ok) return go("/superadmin/payouts", r.error, true);
  await audit(decision === "verified" ? "payout.account_approved" : "payout.account_rejected", { accountId: str(fd, "accountId"), reason: str(fd, "reason") || undefined }, r.tenantId);
  return go("/superadmin/payouts", decision === "verified" ? "Payout account approved." : "Payout account rejected.");
}

export async function createBatchAction() {
  const { user } = await requireSuperadmin();
  const r = await createBatch(user.id);
  if (!r.ok) return go("/superadmin/payouts", r.error, true);
  await audit("payout.batch_created", { batchId: r.batchId, number: r.number, items: r.itemCount, total: r.total });
  return redirect(`/superadmin/payouts/${r.batchId}?ok=${encodeURIComponent(`Draft batch ${r.number} created.`)}`);
}

export async function approveBatchAction(fd: FormData) {
  const { user } = await requireSuperadmin();
  const id = str(fd, "batchId"), page = `/superadmin/payouts/${id}`;
  await stepUpForMoney("payout_approve", page);
  let passwordConfirmed = false;
  if ((await superadminCount()) <= 1) {
    if (!rateLimit(`approve-pw:${user.id}`, 6, 10 * 60_000).ok) return go(page, "Too many attempts. Wait a few minutes.", true);
    passwordConfirmed = await verifyPassword(str(fd, "password"), user.passwordHash);
    if (!passwordConfirmed) return go(page, "Your password was not correct.", true);
  }
  const r = await approveBatch(id, user.id, { passwordConfirmed });
  if (!r.ok) return go(page, r.error, true);
  await audit("payout.batch_approved", { batchId: id, passwordReentered: passwordConfirmed });
  return go(page, "Batch approved. Make the bank transfers, then mark it paid with the bank reference.");
}

export async function markPaidAction(fd: FormData) {
  const { user } = await requireSuperadmin();
  const id = str(fd, "batchId"), page = `/superadmin/payouts/${id}`;
  const r = await markBatchPaid(id, user.id, str(fd, "bankReference"));
  if (!r.ok) return go(page, r.error, true);
  await audit("payout.batch_paid", { batchId: id, bankReference: str(fd, "bankReference") });
  return go(page, "Batch marked as paid. It can no longer be changed.");
}

export async function cancelBatchAction(fd: FormData) {
  await requireSuperadmin();
  const id = str(fd, "batchId");
  const r = await cancelBatch(id);
  if (!r.ok) return go(`/superadmin/payouts/${id}`, r.error, true);
  await audit("payout.batch_cancelled", { batchId: id });
  return go("/superadmin/payouts", "Draft cancelled. Its orders are available again.");
}

/** Full IBAN for one account. Step-up protected and audited; the value is returned to the page, never stored or put in a URL. */
export async function revealIbanAction(accountId: string): Promise<{ ok: boolean; iban?: string; error?: string }> {
  await requireSuperadmin();
  const acc = await db.query.payoutAccounts.findFirst({ where: eq(schema.payoutAccounts.id, accountId) });
  if (!acc) return { ok: false, error: "Account not found" };
  await stepUpForMoney("iban_reveal", "/superadmin/payouts");
  await audit("payout.iban_revealed", { accountId }, acc.tenantId);
  return { ok: true, iban: formatIban(revealIban(acc)) };
}
