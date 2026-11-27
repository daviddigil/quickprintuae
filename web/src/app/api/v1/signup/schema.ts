import { z } from "zod";
import { EMIRATES } from "@/lib/types";

export const RESERVED_SLUGS = new Set([
  "admin", "superadmin", "www", "app", "api", "s", "login", "logout", "signup", "pricing", "static", "assets",
  "mail", "help", "support", "billing", "status", "blog", "docs", "dashboard", "demo-store", "quickprint",
]);

export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/;

export const SignupBody = z.object({
  shopName: z.string().trim().min(2).max(80),
  slug: z.string().trim().toLowerCase().regex(SLUG_RE, "3–32 chars: lowercase letters, numbers and dashes"),
  ownerName: z.string().trim().min(2).max(80),
  email: z.string().trim().email(),
  phone: z.string().trim().regex(/^\+?[0-9 ()-]{7,20}$/, "Enter a valid phone number"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  emirate: z.enum(EMIRATES as [string, ...string[]]),
  plan: z.enum(["starter", "growth", "enterprise"]).default("growth"),
  /** optional promo code; blank = the running campaign (if any) applies automatically */
  promoCode: z.string().trim().max(40).optional(),
  /** must be exactly true: "I agree to the Terms, Privacy Policy and Seller Agreement" (checkbox value "on" from forms is accepted) */
  acceptLegal: z.unknown().optional(),
  /** Cloudflare Turnstile token (only checked when TURNSTILE_SECRET_KEY is set) */
  captchaToken: z.string().max(4096).optional(),
});

/** Only an explicit yes counts as acceptance ("on" is what a plain HTML checkbox submits). */
export const isLegalAccepted = (v: unknown) => v === true || v === "true" || v === "on";
