import Link from "next/link";
import { ShieldAlert } from "lucide-react";

const COPY: Record<string, { tone: string; text: string; cta: string }> = {
  unverified: { tone: "bg-warning-container text-on-warning-container", text: "Your store is in preview. Customers cannot order or pay, and it is not listed, until your business is verified.", cta: "Verify your business" },
  pending_review: { tone: "bg-info-container text-on-info-container", text: "Your business details are being reviewed. Your store stays in preview until they are approved.", cta: "View status" },
  rejected: { tone: "bg-critical-container text-on-critical-container", text: "Your business verification was not approved. Customers cannot order until you correct and resubmit.", cta: "See why and resubmit" },
  expired: { tone: "bg-critical-container text-on-critical-container", text: "Your trade licence has expired, so live orders, payouts and your listing are paused.", cta: "Upload the renewed licence" },
};

/** Owner-facing banner on every admin page until the seller is verified. `detail` is the verification row status (needs_info is shown as unverified + a note). */
export function VerificationBanner({ status, detail, reason }: { status: string; detail?: string | null; reason?: string | null }) {
  const key = detail === "needs_info" ? "unverified" : status;
  const c = COPY[key] ?? COPY.unverified;
  return (
    <div role="status" className={`flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-2 text-sm print:hidden ${c.tone}`} data-testid="verification-banner">
      <ShieldAlert className="size-4 shrink-0" aria-hidden />
      <span>{detail === "needs_info" ? `We need more information to verify your business${reason ? `: ${reason}` : "."}` : c.text}</span>
      <Link href="/admin/verification" className="font-semibold underline underline-offset-2">{c.cta}</Link>
    </div>
  );
}
