"use server";
import { verifyStepUp, safeNext } from "./stepup";
import { redirect } from "next/navigation";

/** Server action used by <StepUpPrompt>. Returns {ok} for inline use, or redirects to `next` when given. */
export async function confirmStepUp(_prev: { ok: boolean; error?: string } | null, fd: FormData): Promise<{ ok: boolean; error?: string }> {
  const r = await verifyStepUp(String(fd.get("credential") ?? ""));
  const next = String(fd.get("next") ?? "");
  if (r.ok && next) redirect(safeNext(next));
  return r;
}
