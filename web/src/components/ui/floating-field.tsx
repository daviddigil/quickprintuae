import { useId } from "react";
import type { ComponentProps } from "react";
import { clsx } from "clsx";

/**
 * Input with a floating label (CSS only; the label is a real <label>, so it works with assistive tech and autofill).
 * Use when space is tight (login, checkout). Use <Field> + <Input> for long forms.
 */
export function FloatingInput({ label, error, className, id, ...p }: Omit<ComponentProps<"input">, "placeholder"> & { label: string; error?: string }) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <div>
      <div className="relative">
        <input id={fid} placeholder=" " aria-invalid={error ? true : undefined} aria-describedby={error ? `${fid}-err` : undefined}
          className={clsx("peer block min-h-14 w-full rounded-shape-md border border-outline-variant bg-surface-lowest px-3 pb-1.5 pt-6 text-sm text-on-surface outline-none transition-[border-color,box-shadow] duration-(--dur-2) hover:border-outline focus:border-primary focus:ring-2 focus:ring-primary/25 aria-invalid:border-critical", className)} {...p} />
        <label htmlFor={fid}
          className="pointer-events-none absolute start-3 top-1.5 text-xs text-on-surface-variant transition-[top,font-size] duration-(--dur-2) ease-emphasized peer-placeholder-shown:top-4 peer-placeholder-shown:text-sm peer-focus:top-1.5 peer-focus:text-xs peer-focus:text-primary">
          {label}
        </label>
      </div>
      {error && <p id={`${fid}-err`} className="mt-1 text-xs text-critical">{error}</p>}
    </div>
  );
}
