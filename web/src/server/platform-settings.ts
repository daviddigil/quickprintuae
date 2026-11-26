import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";

/** Superadmin-controlled platform settings. Values live in `platform_settings` (key/value jsonb). */
export const DEFAULT_TRIAL_DAYS = 7;
export const MAX_TRIAL_DAYS = 60;

export const clampTrialDays = (n: unknown): number => {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? Math.min(MAX_TRIAL_DAYS, Math.max(0, v)) : DEFAULT_TRIAL_DAYS;
};

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  try {
    const row = await db.query.platformSettings.findFirst({ where: eq(schema.platformSettings.key, key) });
    return row ? (row.value as T) : fallback;
  } catch { return fallback; }
}

export async function setSetting(key: string, value: unknown, by?: string | null) {
  await db.insert(schema.platformSettings).values({ key, value, updatedBy: by ?? null })
    .onConflictDoUpdate({ target: schema.platformSettings.key, set: { value, updatedBy: by ?? null, updatedAt: new Date() } });
  if (key === "trialDays") g.__qpTrial = undefined;
}

/**
 * Free-trial length in days for new shops (all plans). Cached for 30 s per process.
 * Marketing pages call `await primeTrialDays()` once at the top so that the synchronous getCopy() can fill {trialDays}.
 */
const g = globalThis as unknown as { __qpTrial?: { at: number; days: number } };
export async function getTrialDays(): Promise<number> {
  const c = g.__qpTrial;
  if (c && Date.now() - c.at < 30_000) return c.days;
  const days = clampTrialDays(await getSetting<number>("trialDays", DEFAULT_TRIAL_DAYS));
  g.__qpTrial = { at: Date.now(), days };
  return days;
}
/** Last known trial length without waiting (falls back to the default). Safe to call from synchronous code after primeTrialDays(). */
export const trialDaysNow = (): number => g.__qpTrial?.days ?? DEFAULT_TRIAL_DAYS;
export async function primeTrialDays(): Promise<number> { return getTrialDays(); }
