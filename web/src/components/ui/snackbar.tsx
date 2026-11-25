"use client";
import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { clsx } from "clsx";

type Tone = "neutral" | "success" | "critical";
interface Item { id: number; message: string; tone: Tone; action?: { label: string; onClick: () => void } }
const Ctx = createContext<{ show: (m: string, o?: { tone?: Tone; action?: Item["action"]; ms?: number }) => void } | null>(null);

/** Wrap the app (or a section) once; call `useSnackbar().show("Saved")` from any client component. Announced politely to screen readers. */
export function SnackbarProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Item[]>([]);
  const n = useRef(0);
  const dismiss = (id: number) => setItems((x) => x.filter((i) => i.id !== id));
  const show = useCallback<NonNullable<React.ContextType<typeof Ctx>>["show"]>((message, o) => {
    const id = ++n.current;
    setItems((x) => [...x.slice(-2), { id, message, tone: o?.tone ?? "neutral", action: o?.action }]);
    setTimeout(() => dismiss(id), o?.ms ?? 5000);
  }, []);
  const value = useMemo(() => ({ show }), [show]);
  return (
    <Ctx.Provider value={value}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col items-start gap-2 sm:inset-x-auto sm:start-6 sm:bottom-6">
        {items.map((i) => (
          <div key={i.id} className={clsx("pointer-events-auto flex max-w-md items-center gap-3 rounded-shape-md px-4 py-3 text-sm shadow-elev-3 rise-run",
            i.tone === "critical" ? "bg-critical text-on-critical" : i.tone === "success" ? "bg-success text-on-success" : "bg-inverse-surface text-inverse-on-surface")}>
            <span>{i.message}</span>
            {i.action && <button type="button" className="font-semibold underline underline-offset-2" onClick={() => { i.action!.onClick(); dismiss(i.id); }}>{i.action.label}</button>}
            <button type="button" aria-label="Dismiss" className="ms-1 grid size-6 place-items-center rounded-full opacity-70 hover:opacity-100" onClick={() => dismiss(i.id)}>×</button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
export function useSnackbar() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useSnackbar must be used inside <SnackbarProvider>");
  return c;
}
