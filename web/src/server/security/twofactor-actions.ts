"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import QRCode from "qrcode";
import { getCurrentUser } from "@/lib/auth";
import { rateLimitAsync } from "@/server/billing/rate-limit";
import { confirmEnrolment, disableTwoFactor, regenerateRecoveryCodes, startEnrolment } from "./twofactor";
import { requireStepUp } from "./stepup";
import { superadminMustHave2FA } from "./policy";

export interface TwoFactorState { ok?: boolean; error?: string; recoveryCodes?: string[] }

async function me() {
  const cu = await getCurrentUser();
  if (!cu || cu.session.imp) redirect("/login");
  return cu;
}

/** Secret + QR for the enrolment screen (generated server side; the secret is encrypted at rest). */
export async function getEnrolmentQr() {
  const { user } = await me();
  const { secret, uri } = await startEnrolment(user);
  return { secret, qr: await QRCode.toDataURL(uri, { margin: 1, width: 220, errorCorrectionLevel: "M" }) };
}

export async function confirmTwoFactor(_p: TwoFactorState | null, fd: FormData): Promise<TwoFactorState> {
  const { user } = await me();
  if (!(await rateLimitAsync(`2fa-enrol:${user.id}`, 8, 10 * 60_000))) return { error: "Too many attempts. Wait a few minutes." };
  const r = await confirmEnrolment(user, String(fd.get("code") ?? ""));
  if (!r.ok) return { error: "That code is not right. Check the time on your phone and try the next code." };
  return { ok: true, recoveryCodes: r.recoveryCodes };
}

export async function regenerateCodesAction(): Promise<TwoFactorState> {
  const { user } = await me();
  await requireStepUp({ next: user.role === "superadmin" ? "/superadmin/security" : "/admin/settings" });
  return { ok: true, recoveryCodes: await regenerateRecoveryCodes(user) };
}

export async function disableTwoFactorAction(): Promise<void> {
  const { user } = await me();
  const back = user.role === "superadmin" ? "/superadmin/security" : "/admin/settings";
  if (user.role === "superadmin" && superadminMustHave2FA()) redirect(`${back}?error=required`);
  await requireStepUp({ next: back });
  await disableTwoFactor(user);
  revalidatePath(back);
  redirect(back);
}
