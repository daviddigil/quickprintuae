"use client";
import { useId, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { clsx } from "clsx";

export interface TabItem { id: string; label: ReactNode; content: ReactNode }

/**
 * Accessible tabs (roving tabindex, arrow/Home/End keys). ALL panels are rendered in the HTML and inactive ones use `hidden`,
 * so the text stays crawlable and available without JavaScript.
 */
export function Tabs({ tabs, defaultId, ariaLabel, className }: { tabs: TabItem[]; defaultId?: string; ariaLabel: string; className?: string }) {
  const [active, setActive] = useState(defaultId ?? tabs[0]?.id);
  const base = useId();
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  function onKey(e: KeyboardEvent, i: number) {
    const last = tabs.length - 1;
    const rtl = getComputedStyle(e.currentTarget as HTMLElement).direction === "rtl"; // in RTL the "next" tab is to the left
    const next = rtl ? "ArrowLeft" : "ArrowRight", prev = rtl ? "ArrowRight" : "ArrowLeft";
    const to = e.key === next ? (i + 1) % tabs.length : e.key === prev ? (i - 1 + tabs.length) % tabs.length : e.key === "Home" ? 0 : e.key === "End" ? last : -1;
    if (to < 0) return;
    e.preventDefault(); setActive(tabs[to].id); refs.current[tabs[to].id]?.focus();
  }
  return (
    <div className={className}>
      <div role="tablist" aria-label={ariaLabel} className="flex gap-1 overflow-x-auto rounded-full bg-surface-container p-1 [scrollbar-width:none]">
        {tabs.map((t, i) => (
          <button key={t.id} ref={(el) => { refs.current[t.id] = el; }} role="tab" type="button" id={`${base}-t-${t.id}`} aria-selected={active === t.id} aria-controls={`${base}-p-${t.id}`} tabIndex={active === t.id ? 0 : -1}
            onClick={() => setActive(t.id)} onKeyDown={(e) => onKey(e, i)}
            className={clsx("min-h-10 shrink-0 rounded-full px-4 text-sm font-semibold transition-[background-color,color,box-shadow] duration-(--dur-2) ease-emphasized [@media(pointer:coarse)]:min-h-11",
              active === t.id ? "bg-surface-lowest text-on-surface shadow-elev-1" : "text-on-surface-variant hover:text-on-surface")}>
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div key={t.id} role="tabpanel" id={`${base}-p-${t.id}`} aria-labelledby={`${base}-t-${t.id}`} hidden={active !== t.id} className="pt-6">{t.content}</div>
      ))}
    </div>
  );
}

/** Segmented control for a single choice (monthly / yearly, list / grid …). */
export function Segmented<T extends string>({ options, value, onChange, ariaLabel }: { options: { value: T; label: ReactNode }[]; value: T; onChange: (v: T) => void; ariaLabel: string }) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="inline-flex rounded-full bg-surface-container p-1">
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
          className={clsx("min-h-9 rounded-full px-4 text-sm font-semibold transition-[background-color,color,box-shadow] duration-(--dur-2) ease-emphasized [@media(pointer:coarse)]:min-h-11",
            value === o.value ? "bg-surface-lowest text-on-surface shadow-elev-1" : "text-on-surface-variant hover:text-on-surface")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
