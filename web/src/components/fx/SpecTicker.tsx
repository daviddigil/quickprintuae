import { clsx } from "clsx";

/**
 * Slow, pausable ticker of print specs. Informational band: the full list is in the HTML once (the duplicate is aria-hidden for the loop).
 * With reduced motion it becomes a static, wrapping list.
 */
export function SpecTicker({ items, className, ariaLabel = "Print specifications supported" }: { items: string[]; className?: string; ariaLabel?: string }) {
  const row = (hidden?: boolean) => (
    <ul className="flex shrink-0 gap-12" aria-hidden={hidden || undefined} aria-label={hidden ? undefined : ariaLabel}>
      {items.map((t) => (
        <li key={t} className="flex items-center gap-3 whitespace-nowrap font-mono text-xs uppercase tracking-[0.12em]">
          <span aria-hidden className="size-1.5 rounded-full bg-primary" />{t}
        </li>
      ))}
    </ul>
  );
  return (
    <div className={clsx("ticker overflow-hidden", className)}>
      <div className="ticker-track">{row()}{row(true)}</div>
    </div>
  );
}
