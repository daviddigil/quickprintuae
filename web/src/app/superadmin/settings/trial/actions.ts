"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSuperadmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { MAX_TRIAL_DAYS, getTrialDays, setSetting } from "@/server/platform-settings";

export async function saveTrialDays(fd: FormData) {
  const { user } = await requireSuperadmin();
  const raw = (fd.get("trialDays") ?? "").toString().trim();
  const n = Number(raw);
  if (raw === "" || !Number.isInteger(n) || n < 0 || n > MAX_TRIAL_DAYS) redirect("/superadmin/settings/trial?error=1");
  const before = await getTrialDays();
  await setSetting("trialDays", n, user.id);
  await audit("settings.trial_days", { from: before, to: n }, null);
  revalidatePath("/", "layout");
  redirect("/superadmin/settings/trial?saved=1");
}
