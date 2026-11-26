/** Offer theme presets (client-safe). A preset fills a sensible name/headline/colours/dates; everything stays editable. */
import type { OfferTheme } from "./offers";

export interface ThemeStyle { bg: string; fg: string; /** button / accent fill */ accent: string; onAccent: string }
export interface ThemePreset { label: string; name: string; headline: string; style: ThemeStyle; /** typical window (UTC instants) for the next occurrence after `from` */ window: (from: Date) => { startsAt: Date; endsAt: Date } }

/** All pairs are checked for WCAG AA (4.5:1) text contrast. */
export const THEME_STYLES: Record<OfferTheme, ThemeStyle> = {
  black_friday: { bg: "#111111", fg: "#ffffff", accent: "#ffd60a", onAccent: "#111111" },
  winter: { bg: "#0b3d5c", fg: "#ffffff", accent: "#bfe9ff", onAccent: "#0b2a3f" },
  summer: { bg: "#ffb703", fg: "#2b1a00", accent: "#2b1a00", onAccent: "#ffffff" },
  ramadan: { bg: "#1b1b4b", fg: "#ffffff", accent: "#f6d365", onAccent: "#1b1b4b" },
  eid: { bg: "#0f5132", fg: "#ffffff", accent: "#f4d35e", onAccent: "#0f2d1d" },
  national_day: { bg: "#b3001b", fg: "#ffffff", accent: "#ffffff", onAccent: "#7a0012" },
  custom: { bg: "#1f2a44", fg: "#ffffff", accent: "#ffd60a", onAccent: "#1f2a44" },
};

/** Gulf Standard Time, UTC+4 (no daylight saving). Dates below are 00:00 / 23:59 Dubai time. */
const dubai = (y: number, m: number, d: number, end = false) => new Date(Date.UTC(y, m - 1, d, end ? 19 : -4, end ? 59 : 0, 0));
const next = (from: Date, make: (y: number) => { startsAt: Date; endsAt: Date }) => {
  const y = from.getUTCFullYear();
  for (const yr of [y, y + 1, y + 2]) { const w = make(yr); if (w.endsAt > from) return w; }
  return make(y + 1);
};
/** Approximate Islamic-calendar dates (moon sighting can shift them by a day). */
const RAMADAN: Record<number, [number, number]> = { 2026: [2, 18], 2027: [2, 8], 2028: [1, 28], 2029: [1, 16], 2030: [1, 6], 2031: [12, 26] };
const EID: Record<number, [number, number]> = { 2026: [3, 20], 2027: [3, 10], 2028: [2, 27], 2029: [2, 15], 2030: [2, 5], 2031: [1, 26] };
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400_000);

export const THEME_PRESETS: Record<OfferTheme, ThemePreset> = {
  black_friday: {
    label: "Black Friday", name: "Black Friday", headline: "Black Friday: our biggest discount of the year", style: THEME_STYLES.black_friday,
    window: (from) => next(from, (y) => { const thu = [22, 23, 24, 25, 26, 27, 28].find((d) => new Date(Date.UTC(y, 10, d)).getUTCDay() === 4)!; return { startsAt: dubai(y, 11, thu - 2), endsAt: dubai(y, 12, 1, true) }; }),
  },
  winter: { label: "Winter", name: "Winter offer", headline: "Warm up your print shop this winter", style: THEME_STYLES.winter, window: (from) => next(from, (y) => ({ startsAt: dubai(y, 12, 1), endsAt: dubai(y + 1, 2, 28, true) })) },
  summer: { label: "Summer", name: "Summer offer", headline: "Summer savings for your print shop", style: THEME_STYLES.summer, window: (from) => next(from, (y) => ({ startsAt: dubai(y, 6, 1), endsAt: dubai(y, 8, 31, true) })) },
  ramadan: {
    label: "Ramadan", name: "Ramadan offer", headline: "Ramadan Kareem: a gift for your shop", style: THEME_STYLES.ramadan,
    window: (from) => next(from, (y) => { const [m, d] = RAMADAN[y] ?? [3, 1]; const s = dubai(y, m, d); return { startsAt: s, endsAt: addDays(dubai(y, m, d, true), 29) }; }),
  },
  eid: {
    label: "Eid", name: "Eid offer", headline: "Eid Mubarak: celebrate with a discount", style: THEME_STYLES.eid,
    window: (from) => next(from, (y) => { const [m, d] = EID[y] ?? [4, 1]; return { startsAt: addDays(dubai(y, m, d), -2), endsAt: addDays(dubai(y, m, d, true), 5) }; }),
  },
  national_day: { label: "UAE National Day", name: "UAE National Day offer", headline: "Celebrate UAE National Day with us", style: THEME_STYLES.national_day, window: (from) => next(from, (y) => ({ startsAt: dubai(y, 11, 25), endsAt: dubai(y, 12, 3, true) })) },
  custom: { label: "Custom", name: "", headline: "", style: THEME_STYLES.custom, window: (from) => ({ startsAt: from, endsAt: addDays(from, 14) }) },
};

export const themeStyle = (t: string): ThemeStyle => THEME_STYLES[(t as OfferTheme) in THEME_STYLES ? (t as OfferTheme) : "custom"];

/** <input type="datetime-local"> value for a UTC instant, shown in Asia/Dubai (UTC+4). */
export const toDubaiInput = (d: Date) => new Date(d.getTime() + 4 * 3600_000).toISOString().slice(0, 16);
/** Parse a datetime-local value as Asia/Dubai time. Returns null when empty/invalid. */
export function fromDubaiInput(v: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) return null;
  const d = new Date(`${v.slice(0, 16)}:00+04:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}
