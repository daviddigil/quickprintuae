import { z } from "zod";
import { createHash } from "crypto";
import { SIMILAR_NAME_THRESHOLD } from "./normalise";

/** Pure rules for seller verification: authority list, input schema, document sniffing, flag keys. No DB. */

export const LICENCE_AUTHORITIES = [
  "Dubai Economy & Tourism (DET)",
  "Abu Dhabi DED (ADDED)",
  "Sharjah Economic Development Dept (SEDD)",
  "Ajman DED",
  "Umm Al Quwain DED",
  "RAK DED",
  "Fujairah",
  "DMCC / free zone",
  "Other",
] as const;
export type LicenceAuthority = (typeof LICENCE_AUTHORITIES)[number];
/** authorities where the owner must type the issuing zone / body */
export const AUTHORITY_NEEDS_DETAIL: readonly string[] = ["DMCC / free zone", "Other"];

export const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024;

/** TRN: exactly 15 digits (spaces and dashes tolerated on input). */
export const normaliseTrn = (v: string) => (v ?? "").replace(/[\s-]/g, "");
export const isValidTrn = (v: string) => /^\d{15}$/.test(normaliseTrn(v));

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter the expiry date");

export const VerificationInput = z.object({
  legalName: z.string().trim().min(3, "Enter the legal business name exactly as on the licence").max(160),
  licenceNumber: z.string().trim().min(3, "Enter the trade licence number").max(40)
    .refine((v) => /[0-9A-Za-z٠-٩]{3,}/.test(v), "Enter the trade licence number"),
  authority: z.enum(LICENCE_AUTHORITIES, { error: "Choose the licensing authority" }),
  authorityDetail: z.string().trim().max(120).optional().default(""),
  licenceExpiry: isoDate,
  activity: z.string().trim().min(3, "Describe the licensed business activity").max(200),
  signatoryName: z.string().trim().min(3, "Enter the authorised signatory's name").max(120),
  trn: z.string().trim().optional().default("").refine((v) => v === "" || isValidTrn(v), "A TRN has 15 digits"),
}).superRefine((v, ctx) => {
  if (AUTHORITY_NEEDS_DETAIL.includes(v.authority) && v.authorityDetail.length < 2)
    ctx.addIssue({ code: "custom", path: ["authorityDetail"], message: v.authority === "Other" ? "Name the licensing authority" : "Type the free zone name" });
  const exp = new Date(`${v.licenceExpiry}T23:59:59+04:00`);
  if (Number.isNaN(exp.getTime())) ctx.addIssue({ code: "custom", path: ["licenceExpiry"], message: "Enter a valid expiry date" });
  else if (exp.getTime() <= Date.now()) ctx.addIssue({ code: "custom", path: ["licenceExpiry"], message: "The licence must not be expired. Renew it, then submit." });
});
export type VerificationInputT = z.infer<typeof VerificationInput>;

export const authorityLabel = (authority: string, detail?: string) => (AUTHORITY_NEEDS_DETAIL.includes(authority) && detail ? `${authority}: ${detail}` : authority);

/** Identify the document from its first bytes (never trust the filename or the browser's content type). */
export function sniffDocument(buf: Uint8Array): { ext: ".pdf" | ".jpg" | ".png"; mime: string } | null {
  if (buf.length < 8) return null;
  if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46 && buf[4] === 0x2d) return { ext: ".pdf", mime: "application/pdf" };
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: ".jpg", mime: "image/jpeg" };
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 && buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a) return { ext: ".png", mime: "image/png" };
  return null;
}

/* ---------- flags ---------- */
export type FlagKind = "similar_name" | "disposable_email" | "shared_ip" | "card_reuse" | "override";
export const FLAG_LABELS: Record<FlagKind, string> = {
  similar_name: "Similar business name on another shop",
  disposable_email: "Disposable email domain",
  shared_ip: "Same network seen on another shop",
  card_reuse: "Card already used for another trial",
  override: "Guard rail overridden by a superadmin",
};
export const flagKind = (f: string): FlagKind | null => { const k = f.split(":")[0] as FlagKind; return k in FLAG_LABELS ? k : null; };

export interface FlagInputs {
  disposableEmail: boolean;
  /** other verifications whose normalised name is similar (score >= threshold) but not identical */
  similar: { tenantId: string; score: number }[];
  /** other shops whose signup used the same hashed IP */
  sharedIpTenants: string[];
  cardReuse: boolean;
}
export function computeFlags(i: FlagInputs): string[] {
  const out: string[] = [];
  if (i.disposableEmail) out.push("disposable_email");
  for (const s of i.similar) if (s.score >= SIMILAR_NAME_THRESHOLD) out.push(`similar_name:${s.tenantId}:${s.score.toFixed(2)}`);
  if (i.sharedIpTenants.length) out.push(`shared_ip:${i.sharedIpTenants.length}`);
  if (i.cardReuse) out.push("card_reuse");
  return out;
}
/** keep existing flags, add new ones, no duplicates */
export const mergeFlags = (a: string[], b: string[]) => [...new Set([...a, ...b])];

/* ---------- hashing (privacy: raw IP / card fingerprint / IBAN never stored for matching) ---------- */
export const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");
export const hashIp = (ip: string, pepper: string) => sha256(`ip:${pepper}:${ip}`).slice(0, 32);
export const hashCardFingerprint = (fp: string) => sha256(fp);

/* ---------- friendly guard-rail messages (never say which shop) ---------- */
export type GuardCode = "email_taken" | "phone_taken" | "licence_taken" | "name_taken" | "trn_taken" | "blocked" | "card_reused" | "card_blocked";
export const GUARD_MESSAGES: Record<GuardCode, string> = {
  email_taken: "This email is already registered. Sign in instead, or use a different email.",
  phone_taken: "We can't create an account with these details. Please contact support if you think this is a mistake.",
  licence_taken: "This trade licence is already registered with QuickPrint. If this is your business, please contact support.",
  name_taken: "This business is already registered with QuickPrint. If this is your business, please contact support.",
  trn_taken: "This TRN is already registered with QuickPrint. If this is your business, please contact support.",
  blocked: "We can't accept these details. Please contact support.",
  card_reused: "This card has already been used to start a free trial. Use a different card, or contact support.",
  card_blocked: "We can't accept this card. Please use a different card or contact support.",
};
export class GuardError extends Error {
  constructor(public code: GuardCode, message = GUARD_MESSAGES[code]) { super(message); }
}
