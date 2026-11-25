import Link from "next/link";
import { eq } from "drizzle-orm";
import { MessageCircle } from "lucide-react";
import { db, schema } from "@/db";
import { whatsappEnabled } from "@/lib/whatsapp-flag";

/** Small dashboard nudge: shown only while the shop has no connected WhatsApp number. */
export async function WhatsappDashboardCard({ tenantId }: { tenantId: string }) {
  if (!whatsappEnabled()) return null;
  const a = await db.query.whatsappAccounts.findFirst({ where: eq(schema.whatsappAccounts.tenantId, tenantId) });
  if (a?.status === "connected") return null;
  return (
    <div className="mb-6 flex flex-col gap-4 rounded-2xl border border-success/50 bg-gradient-to-r from-emerald-50 to-white p-5 sm:flex-row sm:items-center" data-testid="wa-dashboard-card">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#25D366] text-white" aria-hidden><MessageCircle className="h-6 w-6" /></div>
      <div className="min-w-0 flex-1"><p className="font-semibold">Let AI answer your customers on WhatsApp</p><p className="text-sm text-on-surface-variant">Connect your WhatsApp Business number in one tap — keep using your app as usual.</p></div>
      <Link href="/admin/whatsapp" className="inline-flex items-center justify-center rounded-xl bg-[#25D366] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#1fb956]" data-testid="wa-dashboard-connect">Connect WhatsApp</Link>
    </div>
  );
}
