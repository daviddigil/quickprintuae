/** Failed-login lockout policy. Pure so it is unit tested; the login route persists the result in users.failedLogins/lockedUntil. */
export const MAX_FAILED_LOGINS = 5;
export const LOCKOUT_MS = 15 * 60_000;

export interface LockState { failedLogins: number; lockedUntil: Date | null }

export const isLocked = (s: { lockedUntil: Date | null }, now = Date.now()) => !!s.lockedUntil && s.lockedUntil.getTime() > now;

/** State after one more failure. An expired lock starts a fresh count. */
export function registerFailure(s: LockState, now = Date.now()): LockState & { justLocked: boolean } {
  const base = s.lockedUntil && s.lockedUntil.getTime() <= now ? 0 : s.failedLogins;
  const failedLogins = base + 1;
  if (failedLogins >= MAX_FAILED_LOGINS) return { failedLogins, lockedUntil: new Date(now + LOCKOUT_MS), justLocked: !isLocked(s, now) };
  return { failedLogins, lockedUntil: s.lockedUntil && isLocked(s, now) ? s.lockedUntil : null, justLocked: false };
}

export const registerSuccess = (): LockState => ({ failedLogins: 0, lockedUntil: null });
