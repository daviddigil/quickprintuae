import type { ComponentProps, ReactNode } from "react";
import { clsx } from "clsx";

/** Wraps content with crop marks just outside its corners (print-trade motif). Decorative: marks are aria-hidden pseudo elements. */
export function CropMarks({ className, children, ...p }: ComponentProps<"div"> & { children: ReactNode }) {
  return <div className={clsx("crop-marks", className)} {...p}>{children}</div>;
}

/** Monospace "proof" tag, e.g. <ProofLabel>A4 · 80 gsm</ProofLabel>. Use it to label example data and print specs. */
export function ProofLabel({ className, children, ...p }: ComponentProps<"span">) {
  return <span className={clsx("proof-label", className)} {...p}>{children}</span>;
}

/** The four process inks as a tiny colour bar (cyan, magenta, yellow, key). Decorative. */
export function InkBar({ className, size = 6 }: { className?: string; size?: number }) {
  const s = { width: size, height: size };
  return (
    <span aria-hidden className={clsx("inline-flex gap-[3px]", className)}>
      <i style={s} className="rounded-[1px] bg-ink-cyan" /><i style={s} className="rounded-[1px] bg-ink-magenta" />
      <i style={s} className="rounded-[1px] bg-ink-yellow" /><i style={s} className="rounded-[1px] bg-ink-key" />
    </span>
  );
}

/** Registration mark (circle + crosshair). Decorative. */
export function RegMark({ className }: { className?: string }) {
  return <span aria-hidden className={clsx("reg-mark", className)} />;
}
