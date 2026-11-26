import "server-only";
import { getCurrentUser } from "@/lib/auth";

export const clientIp = (req: Request) => req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;

/** The signed-in shop owner (owners only: staff cannot manage the card or the licence). */
export async function currentOwner() {
  const cu = await getCurrentUser();
  if (!cu || cu.user.role !== "owner" || !cu.session.tid || cu.session.imp) return null;
  return { user: cu.user, tenantId: cu.session.tid };
}
