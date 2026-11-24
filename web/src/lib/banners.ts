/** Hero slider rules shared by admin UI, API and storefront. Pure (no server imports) so it is unit-testable and client-safe. */
export const MAX_SLIDES = 8;
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const RECOMMENDED_SIZE = "1920 × 640 px (3:1) — JPG, PNG or WebP, up to 5 MB";

export type BannerState = "live" | "scheduled" | "expired" | "hidden";

export function bannerState(b: { active: boolean; startsAt: Date | string | null; endsAt: Date | string | null }, now = new Date()): BannerState {
  if (!b.active) return "hidden";
  if (b.startsAt && new Date(b.startsAt) > now) return "scheduled";
  if (b.endsAt && new Date(b.endsAt) <= now) return "expired";
  return "live";
}

/** Detects the real image type from file bytes (never trust the client's content-type). SVG is deliberately not allowed. */
export function sniffImage(buf: Uint8Array): { mime: "image/png" | "image/jpeg" | "image/webp"; ext: ".png" | ".jpg" | ".webp" } | null {
  if (buf.length > 12 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return { mime: "image/png", ext: ".png" };
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: "image/jpeg", ext: ".jpg" };
  if (buf.length > 12 && String.fromCharCode(...buf.slice(0, 4)) === "RIFF" && String.fromCharCode(...buf.slice(8, 12)) === "WEBP") return { mime: "image/webp", ext: ".webp" };
  return null;
}

/** Slide links: same-site paths or https URLs only (blocks javascript:, data:, protocol-relative). */
export function safeLink(v: string | null | undefined): string | null {
  const s = (v ?? "").trim();
  if (!s) return null;
  if (s.startsWith("/") && !s.startsWith("//")) return s;
  try { const u = new URL(s); return u.protocol === "https:" ? u.toString() : null; } catch { return null; }
}

/** The shop's local time is UAE (UTC+4, no DST). <input type=datetime-local> values are interpreted as Dubai time. */
export const dubaiLocalToDate = (v: string | null | undefined) => (v ? new Date(`${v}${v.length === 16 ? ":00" : ""}+04:00`) : null);
export const dateToDubaiLocal = (d: Date | string | null) => (d ? new Date(new Date(d).getTime() + 4 * 3600_000).toISOString().slice(0, 16) : "");
