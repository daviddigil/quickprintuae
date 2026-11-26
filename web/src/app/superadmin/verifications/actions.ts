"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSuperadmin } from "@/lib/auth";
import { reviewVerification, removeBlocklistEntry, VerificationError } from "@/server/trust/verification";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const ACTIONS = ["approve", "reject", "needs_info"] as const;

/** Approve / reject (reason required) / request more info (note required). Every outcome is audited and the owner is emailed. */
export async function reviewAction(fd: FormData) {
  const { user } = await requireSuperadmin();
  const id = str(fd, "id");
  const action = str(fd, "action") as (typeof ACTIONS)[number];
  if (!ACTIONS.includes(action) || !/^[0-9a-f-]{36}$/.test(id)) redirect("/superadmin/verifications");
  let msg: { ok?: string; error?: string };
  try {
    const status = await reviewVerification({ id, action, note: str(fd, "note"), reviewerId: user.id, overrideReason: str(fd, "overrideReason"), block: fd.get("block") === "on" });
    msg = { ok: status === "verified" ? "Approved. The shop is verified and live." : status === "rejected" ? "Rejected. The owner has been told why." : "Requested more information from the owner." };
  } catch (e) {
    if (!(e instanceof VerificationError)) throw e;
    msg = { error: e.message };
  }
  revalidatePath("/superadmin/verifications");
  redirect(`/superadmin/verifications/${id}?${new URLSearchParams(msg as Record<string, string>)}`);
}

export async function removeBlockAction(fd: FormData) {
  const { user } = await requireSuperadmin();
  const back = str(fd, "back") || "/superadmin/verifications";
  let msg: { ok?: string; error?: string };
  try { await removeBlocklistEntry({ id: str(fd, "blockId"), reason: str(fd, "reason"), actorId: user.id }); msg = { ok: "Block removed and audited." }; }
  catch (e) { if (!(e instanceof VerificationError)) throw e; msg = { error: e.message }; }
  redirect(`${back.startsWith("/superadmin/") ? back : "/superadmin/verifications"}?${new URLSearchParams(msg as Record<string, string>)}`);
}
