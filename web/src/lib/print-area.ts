import type { MockupArea } from "./types";

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const r1 = (n: number) => Math.round(n * 10) / 10;
export const DEFAULT_MOCKUP: MockupArea = { enabled: false, x: 30, y: 30, w: 40, h: 30 };
/** keeps the rectangle inside the photo (0-100%) with a minimum size */
export function fitArea(a: MockupArea): MockupArea {
  const w = clamp(a.w, 5, 100), h = clamp(a.h, 5, 100);
  return { ...a, w: r1(w), h: r1(h), x: r1(clamp(a.x, 0, 100 - w)), y: r1(clamp(a.y, 0, 100 - h)) };
}

