import type { ProviderConfig } from "./types";

export async function jsonFetch(url: string, init: RequestInit & { timeoutMs?: number } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), init.timeoutMs ?? 15000);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal, cache: "no-store", headers: { Accept: "application/json", "Content-Type": "application/json", ...(init.headers ?? {}) } });
    const text = await res.text();
    let body: Record<string, unknown> = {};
    try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
    if (!res.ok) throw new Error(`${new URL(url).host} ${res.status}: ${String(body.message ?? body.error ?? res.statusText).slice(0, 200)}`);
    return body;
  } finally {
    clearTimeout(t);
  }
}

/** Fake reference for demo/sandbox mode. */
export const fakeRef = (prefix: string) => `${prefix}-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

export function requireKey(cfg: ProviderConfig, provider: string) {
  if (!cfg.apiKey) throw new Error(`${provider} API key is not configured`);
  return cfg.apiKey;
}

/** Deep-pick the first present value among dotted paths. */
export function pick(obj: unknown, ...paths: string[]): unknown {
  for (const p of paths) {
    let cur: unknown = obj;
    for (const k of p.split(".")) cur = cur && typeof cur === "object" ? (cur as Record<string, unknown>)[k] : undefined;
    if (cur !== undefined && cur !== null && cur !== "") return cur;
  }
  return undefined;
}
