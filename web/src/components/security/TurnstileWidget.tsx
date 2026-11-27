"use client";
import { useEffect, useRef } from "react";

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

interface TurnstileApi { render(el: HTMLElement, o: Record<string, unknown>): string; remove(id: string): void }
declare global { interface Window { turnstile?: TurnstileApi } }

let loading: Promise<void> | null = null;
function loadScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT_SRC; s.async = true; s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => { loading = null; reject(new Error("turnstile script failed")); };
    document.head.appendChild(s);
  });
  return loading;
}

/** The site key is public. Unset = the widget is off and renders nothing (dev, tests, pre-launch). */
export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";

/**
 * Cloudflare Turnstile challenge. Renders nothing and loads no script unless a site key is configured.
 * `onToken(token)` fires when solved, `onToken(null)` when it expires or errors. A token works once: after a failed
 * submit, remount the widget (change its `key`) to get a fresh one.
 */
export function TurnstileWidget({ siteKey = TURNSTILE_SITE_KEY, onToken, theme = "auto", className }: { siteKey?: string; onToken: (token: string | null) => void; theme?: "auto" | "light" | "dark"; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const cb = useRef(onToken);
  cb.current = onToken;
  useEffect(() => {
    if (!siteKey || !box.current) return;
    let id: string | null = null, dead = false;
    loadScript().then(() => {
      if (dead || !box.current || !window.turnstile) return;
      id = window.turnstile.render(box.current, {
        sitekey: siteKey, theme,
        callback: (t: string) => cb.current(t),
        "expired-callback": () => cb.current(null),
        "error-callback": () => cb.current(null),
      });
    }).catch(() => cb.current(null));
    return () => { dead = true; if (id && window.turnstile) window.turnstile.remove(id); };
  }, [siteKey, theme]);
  if (!siteKey) return null;
  return <div ref={box} className={className} data-testid="turnstile" />;
}
