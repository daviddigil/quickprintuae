import Link from "next/link";
import { InkBar } from "@/components/ui";

/** Wordmark with the four process inks as a tiny bar. */
export function Logo({ className = "", href = "/" }: { className?: string; href?: string }) {
  return (
    <Link href={href} className={`inline-flex items-center gap-2 text-xl font-bold tracking-tight text-on-surface ${className}`} aria-label="QuickPrint home">
      <InkBar size={5} className="flex-wrap w-[13px]" />
      <span>Quick<span className="text-primary">Print</span></span>
    </Link>
  );
}
