"use server";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { DSR_KINDS, type DsrKind } from "@/lib/compliance";
import { createDataSubjectRequest } from "@/server/privacy";

/** The shop owner asks the PLATFORM about their own account data (tenantId null = platform-level queue). */
export async function fileOwnRequest(fd: FormData) {
  const { user } = await requireStaff({ ownerOnly: true });
  const kind = (fd.get("kind") ?? "").toString() as DsrKind;
  if (!(DSR_KINDS as readonly string[]).includes(kind)) redirect("/admin/privacy?error=" + encodeURIComponent("Choose a request type"));
  const { request, created } = await createDataSubjectRequest({ tenantId: null, userId: user.id, email: user.email, kind, note: (fd.get("note") ?? "").toString() });
  if (created) await audit("privacy.owner_request", { requestId: request.id, kind }, null);
  redirect("/admin/privacy?ok=" + encodeURIComponent(created ? "Request received. We will answer within the legal deadline." : "You already have an open request of this type."));
}
