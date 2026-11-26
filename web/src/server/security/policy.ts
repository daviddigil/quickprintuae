/** Security policy switches, in one place so they are unit tested and documented. */
export function superadminMustHave2FA(e: { NODE_ENV?: string; REQUIRE_SUPERADMIN_2FA?: string } = process.env): boolean {
  return e.NODE_ENV === "production" && e.REQUIRE_SUPERADMIN_2FA !== "0";
}
export const STEP_UP_MAX_AGE_MS = 10 * 60_000;
export const MIN_PASSWORD_LENGTH = 10;
