import Link from "next/link";

/** Brand mark: gradient QP tile (placeholder until the master logo lands in /public/brand) + QUICKPRINT / UAE.COM wordmark. */
export function Logo({ className = "", href = "/", onDark = false, label = "QuickPrint uae.com home" }: { className?: string; href?: string; onDark?: boolean; label?: string }) {
  return (
    <Link href={href} className={`inline-flex items-center gap-2.5 ${onDark ? "text-white" : "text-on-surface"} ${className}`} aria-label={label}>
      <span aria-hidden className="grid h-8 w-8 place-items-center rounded-xl text-[13px] font-extrabold tracking-tight text-white" style={{ background: "linear-gradient(135deg,#00ffcc 0%,#ff007f 50%,#3300ff 100%)" }}>QP</span>
      <span className="flex flex-col leading-none">
        <span className="text-lg font-extrabold uppercase tracking-tight">QuickPrint</span>
        <span className={`mt-0.5 text-[10px] font-semibold uppercase tracking-[0.22em] ${onDark ? "text-[#00ffcc]" : "text-tertiary"}`}>uae.com</span>
      </span>
    </Link>
  );
}
