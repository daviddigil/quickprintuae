import { clsx } from "clsx";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export const cn = clsx;

type Variant = "primary" | "secondary" | "ghost" | "danger" | "store";
const variants: Record<Variant, string> = {
  primary: "bg-slate-900 text-white hover:bg-slate-800",
  secondary: "bg-white text-slate-900 border border-slate-300 hover:bg-slate-50",
  ghost: "text-slate-700 hover:bg-slate-100",
  danger: "bg-red-600 text-white hover:bg-red-700",
  store: "btn-store",
};
const base = "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition disabled:opacity-50 disabled:pointer-events-none";

export function Button({ variant = "primary", className, ...p }: ComponentProps<"button"> & { variant?: Variant }) {
  return <button className={cn(base, variants[variant], className)} {...p} />;
}
export function LinkButton({ variant = "primary", className, ...p }: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={cn(base, variants[variant], className)} {...p} />;
}

export function Input({ className, ...p }: ComponentProps<"input">) {
  return <input className={cn("w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200", className)} {...p} />;
}
export function Select({ className, ...p }: ComponentProps<"select">) {
  return <select className={cn("w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500", className)} {...p} />;
}
export function Textarea({ className, ...p }: ComponentProps<"textarea">) {
  return <textarea className={cn("w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500", className)} {...p} />;
}
export function Label({ children, hint, className }: { children: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <label className={cn("mb-1 block text-sm font-medium text-slate-700", className)}>
      {children}
      {hint && <span className="ml-1 font-normal text-slate-400">{hint}</span>}
    </label>
  );
}
export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return <div><Label hint={hint}>{label}</Label>{children}</div>;
}

export function Card({ className, ...p }: ComponentProps<"div">) {
  return <div className={cn("rounded-xl border border-slate-200 bg-white shadow-sm", className)} {...p} />;
}
export function CardHeader({ title, action, subtitle }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
      <div><h3 className="font-semibold">{title}</h3>{subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}</div>
      {action}
    </div>
  );
}

const badgeTones = {
  gray: "bg-slate-100 text-slate-700", green: "bg-emerald-100 text-emerald-800", yellow: "bg-amber-100 text-amber-800",
  red: "bg-red-100 text-red-700", blue: "bg-sky-100 text-sky-800", purple: "bg-violet-100 text-violet-800",
};
export function Badge({ tone = "gray", children }: { tone?: keyof typeof badgeTones; children: ReactNode }) {
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", badgeTones[tone])}>{children}</span>;
}

export const ORDER_STATUS_TONE: Record<string, keyof typeof badgeTones> = {
  pending_payment: "yellow", paid: "blue", in_production: "purple", ready: "green", out_for_delivery: "blue",
  delivered: "green", picked_up: "green", cancelled: "red", refunded: "gray",
};

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <Card className="p-5">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
    </Card>
  );
}

export function Table({ head, children }: { head: ReactNode[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
          <tr>{head.map((h, i) => <th key={i} className="px-4 py-3 font-medium">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="px-6 py-12 text-center text-slate-500"><p className="font-medium text-slate-700">{title}</p>{children}</div>;
}

export function Alert({ tone = "red", children }: { tone?: "red" | "green" | "yellow" | "blue"; children: ReactNode }) {
  const t = { red: "bg-red-50 text-red-800 border-red-200", green: "bg-emerald-50 text-emerald-800 border-emerald-200", yellow: "bg-amber-50 text-amber-900 border-amber-200", blue: "bg-sky-50 text-sky-900 border-sky-200" }[tone];
  return <div className={cn("rounded-lg border px-4 py-3 text-sm", t)}>{children}</div>;
}
