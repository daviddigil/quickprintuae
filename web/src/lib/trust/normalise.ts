import { normalizePhone } from "../phone";

/** Canonical forms used by the duplicate-account guard rails. Two inputs that normalise to the same key are the same seller. */

export function canonicalEmail(email: string): string {
  const e = (email ?? "").trim().toLowerCase();
  const at = e.lastIndexOf("@");
  if (at < 1) return e;
  let local = e.slice(0, at), domain = e.slice(at + 1);
  if (domain === "googlemail.com") domain = "gmail.com";
  local = local.split("+")[0];
  if (domain === "gmail.com") local = local.replace(/\./g, "");
  return `${local}@${domain}`;
}

const DISPOSABLE = new Set(["mailinator.com", "guerrillamail.com", "10minutemail.com", "tempmail.com", "temp-mail.org", "yopmail.com", "trashmail.com", "sharklasers.com", "getnada.com", "dispostable.com", "maildrop.cc", "throwawaymail.com"]);
export const isDisposableEmail = (email: string) => DISPOSABLE.has((email.split("@")[1] ?? "").toLowerCase());

export const canonicalPhone = (phone: string): string | null => normalizePhone(phone);

/** Trade licence number: uppercase letters and digits only ("CN-1234567" == "cn 1234567"). */
export const normaliseLicence = (n: string) => (n ?? "").toUpperCase().replace(/[^A-Z0-9٠-٩]/g, "");

const LEGAL_SUFFIX = ["llc", "l l c", "fze", "fzc", "fzco", "fz llc", "est", "establishment", "ltd", "limited", "co", "company", "inc", "sole proprietorship", "sole prop", "pjsc", "ذمم", "ذ م م", "ش ذ م م", "شذمم", "مؤسسة", "شركة"];

/** Business name: lower-case, no diacritics/punctuation, "&" = "and", legal-form words removed, spaces collapsed. */
export function normaliseBusinessName(name: string): string {
  let s = (name ?? "").toLowerCase().normalize("NFKD").replace(/[̀-ًͯ-ٰٟ]/g, "");
  s = s.replace(/&/g, " and ").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
  for (const suf of [...LEGAL_SUFFIX].sort((a, b) => b.length - a.length)) {
    s = s.replace(new RegExp(`(^|\\s)${suf}(?=\\s|$)`, "gu"), " ");
  }
  return s.replace(/\s+/g, " ").trim();
}

/** Levenshtein-based similarity 0..1 between two normalised names (1 = identical). */
export function nameSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const m = a.length, n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return 1 - prev[n] / Math.max(m, n);
}

export const SIMILAR_NAME_THRESHOLD = 0.85;
