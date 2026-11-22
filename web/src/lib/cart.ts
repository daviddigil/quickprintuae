"use client";
import { useCallback, useSyncExternalStore } from "react";
import type { CartLine } from "./types";

const key = (store: string) => `qp_cart_${store}`;
const EVT = "qp-cart-change";
const EMPTY: CartLine[] = [];
const cache = new Map<string, { raw: string | null; lines: CartLine[] }>();

export function readCart(store: string): CartLine[] {
  if (typeof window === "undefined") return EMPTY;
  const raw = window.localStorage.getItem(key(store));
  const hit = cache.get(store);
  if (hit && hit.raw === raw) return hit.lines;
  let lines: CartLine[] = EMPTY;
  try { lines = raw ? (JSON.parse(raw) as CartLine[]) : EMPTY; } catch { lines = EMPTY; }
  cache.set(store, { raw, lines });
  return lines;
}

export function writeCart(store: string, lines: CartLine[]) {
  window.localStorage.setItem(key(store), JSON.stringify(lines));
  window.dispatchEvent(new Event(EVT));
}

export function addToCart(store: string, line: Omit<CartLine, "key">) {
  const k = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  writeCart(store, [...readCart(store), { ...line, key: k }]);
}
export function removeFromCart(store: string, k: string) {
  writeCart(store, readCart(store).filter((l) => l.key !== k));
}
export function clearCart(store: string) {
  writeCart(store, []);
}

function subscribe(cb: () => void) {
  window.addEventListener(EVT, cb);
  window.addEventListener("storage", cb);
  return () => { window.removeEventListener(EVT, cb); window.removeEventListener("storage", cb); };
}

export function useCart(store: string) {
  const lines = useSyncExternalStore(subscribe, () => readCart(store), () => EMPTY);
  const remove = useCallback((k: string) => removeFromCart(store, k), [store]);
  const clear = useCallback(() => clearCart(store), [store]);
  return { lines, remove, clear, count: lines.length, estimate: lines.reduce((a, l) => a + l.estimate, 0) };
}
