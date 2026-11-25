"use client";
import { useId } from "react";
import { clsx } from "clsx";

/** On/off switch (role=switch). The label is always visible and clickable. */
export function Switch({ checked, onChange, label, hint, disabled, className }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string; disabled?: boolean; className?: string }) {
  const id = useId();
  return (
    <div className={clsx("flex items-start gap-3", className)}>
      <button id={id} type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)}
        className={clsx("relative mt-0.5 h-7 w-12 shrink-0 rounded-full border transition-colors duration-(--dur-2) disabled:opacity-50 [@media(pointer:coarse)]:h-8 [@media(pointer:coarse)]:w-14",
          checked ? "border-primary bg-primary" : "border-outline bg-surface-container-high")}>
        <span aria-hidden className={clsx("absolute top-1/2 size-5 -translate-y-1/2 rounded-full shadow-elev-1 transition-[inset-inline-start,background-color] duration-(--dur-3) ease-spring [@media(pointer:coarse)]:size-6",
          checked ? "start-[calc(100%-1.5rem)] bg-on-primary" : "start-1 bg-outline")} />
      </button>
      <label htmlFor={id} className="cursor-pointer text-sm">
        <span className="font-medium text-on-surface">{label}</span>
        {hint && <span className="block text-on-surface-variant">{hint}</span>}
      </label>
    </div>
  );
}
