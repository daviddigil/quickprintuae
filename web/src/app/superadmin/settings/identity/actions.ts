"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSuperadmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { normalizePlatformIdentity, validatePlatformIdentity } from "@/lib/platform-identity";
import { getPlatformIdentity, setPlatformIdentity } from "@/server/platform-identity";

export async function savePlatformIdentity(fd: FormData) {
  const { user } = await requireSuperadmin();
  const next = normalizePlatformIdentity({
    legalName: fd.get("legalName"), trn: fd.get("trn"), address: fd.get("address"), email: fd.get("email"), vatRegistered: fd.get("vatRegistered"),
  });
  const err = validatePlatformIdentity(next);
  if (err) redirect(`/superadmin/settings/identity?error=${encodeURIComponent(err)}`);
  const before = await getPlatformIdentity();
  await setPlatformIdentity(next, user.id);
  await audit("settings.platform_identity", { from: before, to: next }, null);
  revalidatePath("/superadmin", "layout");
  redirect("/superadmin/settings/identity?saved=1");
}
