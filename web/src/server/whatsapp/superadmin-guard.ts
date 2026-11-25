import "server-only";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

/** API guard: 401 when signed out, 403 for any non-superadmin (owners/staff/customers). */
export async function superadminGuard(): Promise<{ ok: true; userId: string } | { ok: false; res: NextResponse }> {
  const cu = await getCurrentUser();
  if (!cu) return { ok: false, res: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (cu.user.role !== "superadmin") return { ok: false, res: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { ok: true, userId: cu.user.id };
}
