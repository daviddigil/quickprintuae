import { clsx } from "clsx";
import Link from "next/link";
import { Children, cloneElement, isValidElement, useId } from "react";
import type { ComponentProps, ReactElement, ReactNode } from "react";

/**
 * QuickPrint UI primitives (tokens: src/app/globals.css, docs: docs/DESIGN_SYSTEM.md).
 * Backwards compatible: every export below keeps its original name and props; new props are optional.
 * Client components live in their own files and are re-exported at the bottom.
 */
export const cn = clsx;

/* ------------------------------ Buttons ------------------------------------ */
type Variant =
  | "primary" | "filled" | "tonal" | "outlined" | "text" | "dark" | "danger" | "store"
  /* legacy aliases */ | "secondary" | "ghost";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary: "bg-primary text-on-primary shadow-elev-1 hover:shadow-elev-2",
  filled: "bg-primary text-on-primary shadow-elev-1 hover:shadow-elev-2",
  tonal: "bg-secondary-container text-on-secondary-container",
  outlined: "border border-outline bg-transparent text-primary",
  text: "bg-transparent text-primary",
  dark: "bg-on-surface text-surface shadow-elev-1",
  danger: "bg-critical text-on-critical shadow-elev-1",
  store: "btn-store shadow-elev-1",
  secondary: "border border-outline-variant bg-surface-lowest text-on-surface",
  ghost: "bg-transparent text-on-surface-variant",
};
const sizes: Record<Size, string> = {
  sm: "min-h-9 px-3 text-sm",
  /* 40px on fine pointers, 44px touch target on touch screens */
  md: "min-h-10 px-4 text-sm [@media(pointer:coarse)]:min-h-11",
  lg: "min-h-12 px-6 text-base",
};
const buttonBase =
  "state-layer inline-flex items-center justify-center gap-2 font-semibold whitespace-nowrap select-none " +
  "transition-[box-shadow,transform] duration-(--dur-2) ease-emphasized active:scale-[0.98] " +
  "disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50";
const shapeCls = (pill?: boolean) => (pill ? "rounded-full" : "rounded-shape-md");

export function Button({ variant = "primary", size = "md", pill, className, ...p }: ComponentProps<"button"> & { variant?: Variant; size?: Size; pill?: boolean }) {
  return <button className={cn(buttonBase, shapeCls(pill), sizes[size], variants[variant], className)} {...p} />;
}
export function LinkButton({ variant = "primary", size = "md", pill, className, ...p }: ComponentProps<typeof Link> & { variant?: Variant; size?: Size; pill?: boolean }) {
  return <Link className={cn(buttonBase, shapeCls(pill), sizes[size], variants[variant], className)} {...p} />;
}

/* ------------------------------ Form controls ------------------------------- */
const controlBase =
  "w-full min-h-10 rounded-shape-md border border-outline-variant bg-surface-lowest px-3 py-2 text-sm text-on-surface " +
  "placeholder:text-on-surface-variant/70 outline-none transition-[border-color,box-shadow] duration-(--dur-2) " +
  "hover:border-outline focus:border-primary focus:ring-2 focus:ring-primary/25 " +
  "disabled:cursor-not-allowed disabled:bg-surface-container disabled:text-on-surface-variant aria-invalid:border-critical aria-invalid:ring-critical/20 " +
  "[@media(pointer:coarse)]:min-h-11";

export function Input({ className, ...p }: ComponentProps<"input">) {
  return <input className={cn(controlBase, className)} {...p} />;
}
const chevron =
  "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16' fill='none' stroke='%2385787a' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M4 6l4 4 4-4'/%3E%3C/svg%3E\")] bg-no-repeat bg-[position:right_0.75rem_center] rtl:bg-[position:left_0.75rem_center]";
export function Select({ className, ...p }: ComponentProps<"select">) {
  return <select className={cn(controlBase, "appearance-none pe-9", chevron, className)} {...p} />;
}
export function Textarea({ className, ...p }: ComponentProps<"textarea">) {
  return <textarea className={cn(controlBase, "min-h-20", className)} {...p} />;
}

export function Label({ children, hint, className, htmlFor }: { children: ReactNode; hint?: ReactNode; className?: string; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className={cn("mb-1.5 block text-sm font-medium text-on-surface", className)}>
      {children}
      {hint && <span className="ms-1 font-normal text-on-surface-variant">{hint}</span>}
    </label>
  );
}

/** Label + control. When the child is a single element (Input/Select/Textarea) it gets a stable id so the label is truly associated. */
export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  const auto = useId();
  const only = Children.count(children) === 1 && isValidElement(children) ? (children as ReactElement<{ id?: string }>) : null;
  const id = only?.props.id ?? (only ? auto : undefined);
  return (
    <div>
      <Label hint={hint} htmlFor={id}>{label}</Label>
      {only && !only.props.id ? cloneElement(only, { id }) : children}
    </div>
  );
}

/* ------------------------------ Surfaces ------------------------------------- */
const cardVariants = {
  outlined: "bg-surface-lowest border border-outline-variant",
  elevated: "bg-surface-lowest shadow-elev-2",
  filled: "bg-surface-low",
};
export function Card({ className, variant = "outlined", ...p }: ComponentProps<"div"> & { variant?: keyof typeof cardVariants }) {
  return <div className={cn("rounded-shape-lg text-on-surface", cardVariants[variant], className)} {...p} />;
}
export function CardHeader({ title, action, subtitle }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-outline-variant/70 px-5 py-4">
      <div className="min-w-0"><h3 className="font-semibold tracking-tight">{title}</h3>{subtitle && <p className="text-sm text-on-surface-variant">{subtitle}</p>}</div>
      {action}
    </div>
  );
}

/* ------------------------------ Status ---------------------------------------- */
const badgeTones = {
  gray: "bg-surface-container text-on-surface-variant",
  green: "bg-success-container text-on-success-container",
  yellow: "bg-warning-container text-on-warning-container",
  red: "bg-critical-container text-on-critical-container",
  blue: "bg-info-container text-on-info-container",
  purple: "bg-tertiary-container text-on-tertiary-container",
  /* ink accents for categories */
  cyan: "bg-[color-mix(in_srgb,var(--ink-cyan)_18%,transparent)] text-on-surface",
  magenta: "bg-[color-mix(in_srgb,var(--ink-magenta)_16%,transparent)] text-on-surface",
  yellowink: "bg-[color-mix(in_srgb,var(--ink-yellow)_24%,transparent)] text-on-surface",
};
const dotTones: Record<keyof typeof badgeTones, string> = {
  gray: "bg-outline", green: "bg-success", yellow: "bg-warning", red: "bg-critical", blue: "bg-info", purple: "bg-tertiary",
  cyan: "bg-ink-cyan", magenta: "bg-ink-magenta", yellowink: "bg-ink-yellow",
};
/** Pill that shows state in form (colour + optional dot), not only in words. */
export function Badge({ tone = "gray", dot, children }: { tone?: keyof typeof badgeTones; dot?: boolean; children: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium", badgeTones[tone])}>
      {dot && <span aria-hidden className={cn("size-1.5 rounded-full", dotTones[tone])} />}
      {children}
    </span>
  );
}
export const StatusPill = Badge;

export const ORDER_STATUS_TONE: Record<string, keyof typeof badgeTones> = {
  pending_payment: "yellow", paid: "blue", in_production: "purple", ready: "green", out_for_delivery: "blue",
  delivered: "green", picked_up: "green", cancelled: "red", refunded: "gray",
};

const stripe = { neutral: "before:bg-outline-variant", success: "before:bg-success", warning: "before:bg-warning", critical: "before:bg-critical", info: "before:bg-info" };
/** Summary figure: value first, trend and sparkline as support, severity shown as a side stripe. */
export function Stat({ label, value, sub, tone = "neutral", trend, spark }: { label: string; value: ReactNode; sub?: ReactNode; tone?: keyof typeof stripe; trend?: ReactNode; spark?: ReactNode }) {
  return (
    <div className={cn("relative overflow-hidden rounded-shape-lg border border-outline-variant bg-surface-lowest p-5 ps-6 text-on-surface", "before:absolute before:inset-y-0 before:start-0 before:w-1", stripe[tone])}>
      <p className="text-sm text-on-surface-variant">{label}</p>
      <div className="mt-1 flex items-end justify-between gap-3">
        <p className="text-2xl font-bold tracking-tight tabular-nums">{value}</p>
        {spark && <div className="h-9 w-24 shrink-0">{spark}</div>}
      </div>
      {(sub || trend) && <p className="mt-1 flex items-center gap-2 text-xs text-on-surface-variant">{trend}{sub}</p>}
    </div>
  );
}

export function Table({ head, children }: { head: ReactNode[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Data table">
      <table className="w-full text-start text-sm tabular-nums">
        <thead className="border-b border-outline-variant bg-surface-low text-xs uppercase tracking-wide text-on-surface-variant">
          <tr>{head.map((h, i) => <th key={i} className="px-4 py-3 text-start font-medium">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-outline-variant/60 [&>tr]:transition-colors [&>tr:hover]:bg-surface-low">{children}</tbody>
      </table>
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="px-6 py-12 text-center text-on-surface-variant"><p className="font-medium text-on-surface">{title}</p>{children}</div>;
}

const alertTones = {
  red: "bg-critical-container text-on-critical-container before:bg-critical",
  green: "bg-success-container text-on-success-container before:bg-success",
  yellow: "bg-warning-container text-on-warning-container before:bg-warning",
  blue: "bg-info-container text-on-info-container before:bg-info",
};
export function Alert({ tone = "red", children }: { tone?: keyof typeof alertTones; children: ReactNode }) {
  return (
    <div role={tone === "red" ? "alert" : "status"} className={cn("relative overflow-hidden rounded-shape-md px-4 py-3 ps-5 text-sm before:absolute before:inset-y-0 before:start-0 before:w-1", alertTones[tone])}>
      {children}
    </div>
  );
}

/* ------------------------------ Client components & print motifs ------------- */
export { Tabs, Segmented } from "./tabs";
export { Switch } from "./switch";
export { SnackbarProvider, useSnackbar } from "./snackbar";
export { FloatingInput } from "./floating-field";
export { CropMarks, ProofLabel, InkBar, RegMark } from "./print";
export { Sparkline, Meter } from "./charts";
