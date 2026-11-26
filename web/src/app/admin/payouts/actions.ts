"use server";
import { redirect } from "next/navigation";
import { requireStaff, verifyPassword } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";
import { UAE_BANKS } from "@/lib/trust/iban";
import { savePayoutAccount } from "@/server/payouts/account";

const str = (fd: FormData, k: string) => (fd.get(k) ?? "").toString().trim();
const OTHER = UAE_BANKS[UAE_BANKS.length - 1];

/** Owner saves or CHANGES the payout bank details. Needs the owner's password again; resets approval and starts the 48 h payout hold. */
export async function savePayoutAccountAction(fd: FormData) {
  const { tenant, user } = await requireStaff({ ownerOnly: true });
  const back = (msg: string, err?: boolean): never => {
    const to = str(fd, "returnTo") === "/admin/payments" ? "/admin/payments" : "/admin/payouts";
    redirect(`${to}?${err ? "error" : "ok"}=${encodeURIComponent(msg)}`);
  };
  if (!rateLimit(`payout-pw:${user.id}`, 6, 10 * 60_000).ok) back("Too many attempts. Wait a few minutes and try again.", true);
  if (!(await verifyPassword(str(fd, "password"), user.passwordHash))) {
    await audit("payout.account_password_failed", {}, tenant.id);
    back("Your password was not correct. Bank details were not saved.", true);
  }
  const picked = str(fd, "bank");
  const bankName = picked === OTHER ? str(fd, "otherBank") : picked;
  const r = await savePayoutAccount(tenant.id, user.id, { holderName: str(fd, "holderName"), bankName, iban: str(fd, "iban"), accountNumber: str(fd, "accountNumber"), swift: str(fd, "swift") });
  if (!r.ok) back(r.error, true);
  else {
    await audit(r.changed ? "payout.account_saved" : "payout.account_unchanged", { bank: bankName, holdUntil: r.holdUntil?.toISOString() ?? null, nameWarning: !!r.warning }, tenant.id);
    back(r.changed
      ? `Bank details saved and sent for review. Payouts are paused for 48 hours as a safety check.${r.warning ? " " + r.warning : ""}`
      : "Nothing changed.");
  }
}
