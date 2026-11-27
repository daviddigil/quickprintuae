/** Client-safe cookie consent helpers. Essential cookies need no consent; analytics stays OFF unless the visitor turns it on. */
export const NOTICE_COOKIE = "qp_cookie_notice";
export const ANALYTICS_COOKIE = "qp_analytics";

export function readCookie(name: string, cookie = typeof document === "undefined" ? "" : document.cookie): string | null {
  for (const part of cookie.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}
export function writeCookie(name: string, value: string, days = 365) {
  document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=${days * 86400}; Path=/; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
}
/** True only after the visitor opted in to analytics. Nothing in the app loads analytics today; any future script MUST check this first. */
export const analyticsAllowed = (cookie?: string) => readCookie(ANALYTICS_COOKIE, cookie) === "1";
