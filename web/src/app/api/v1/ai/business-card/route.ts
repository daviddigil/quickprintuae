import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { getCustomer } from "@/lib/auth";
import { quotaMessage } from "@/lib/ai-quota";
import { designQuota, planDesignLimit, withDesignQuota } from "@/server/ai/card-quota";
import { recordUsage } from "@/server/usage";
import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveTenant } from "@/lib/tenant";
import { verifyTurnstile } from "@/server/captcha";
import { generateCardDesigns } from "@/server/ai/card-designer";

export const runtime = "nodejs";
export const maxDuration = 120;

const Body = z.object({
  store: z.string().min(1).max(120),
  /** Cloudflare Turnstile token (only checked when TURNSTILE_SECRET_KEY is set) */
  captchaToken: z.string().max(4096).optional(),
  widthMm: z.number().min(40).max(120).optional(),
  heightMm: z.number().min(40).max(120).optional(),
  doubleSided: z.boolean().optional(),
  details: z.object({
    name: z.string().trim().min(1).max(80),
    title: z.string().max(80).optional(),
    company: z.string().max(80).optional(),
    phone: z.string().max(40).optional(),
    email: z.string().max(80).optional(),
    website: z.string().max(100).optional(),
    address: z.string().max(160).optional(),
    industry: z.string().max(80).optional(),
    style: z.string().max(80).optional(),
    colors: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).max(3).optional(),
    logo: z.string().max(400_000).regex(/^data:image\/(png|jpe?g|webp|svg\+xml);base64,/).optional(),
  }),
});

/* simple in-memory per-IP limiter: 8 generations / 10 minutes (per server instance) */
const WINDOW = 10 * 60_000, LIMIT = 8;
const hits = new Map<string, number[]>();
function limited(ip: string) {
  const now = Date.now();
  const arr = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW);
  if (arr.length >= LIMIT) { hits.set(ip, arr); return true; }
  arr.push(now); hits.set(ip, arr);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < WINDOW)) hits.delete(k);
  return false;
}

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Please fill in at least your name", issues: parsed.error.issues }, { status: 400 });
  const { store, details, widthMm, heightMm, doubleSided } = parsed.data;

  const tenant = await resolveTenant(store);
  if (!tenant || tenant.status === "suspended" || tenant.status === "cancelled") return NextResponse.json({ error: "Store not found" }, { status: 404 });
  if (tenant.settings?.aiDesignerEnabled === false) return NextResponse.json({ error: "AI designer is not enabled for this store" }, { status: 403 });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
  if (limited(`${tenant.id}:${ip}`)) return NextResponse.json({ error: "Too many designs requested. Please wait a few minutes." }, { status: 429 });

  // per-customer monthly allowance by plan (Starter 3, Growth 5, Enterprise 15); the shop is billed for every AI design it generates
  const cap = await verifyTurnstile(parsed.data.captchaToken, ip === "local" ? null : ip);
  if (!cap.ok) return NextResponse.json({ error: cap.message, captcha: true }, { status: 400 });
  const who = await identify(tenant.id);
  const run = await withDesignQuota(tenant, who.subject, ip, () => generateCardDesigns(details, { widthMm, heightMm, doubleSided }));
  if (!run.allowed) return withVisitor(NextResponse.json({ error: quotaMessage(run.quota), quota: run.quota, limitReached: true }, { status: 429 }), who);
  if (run.result.source === "ai") await recordUsage(tenant.id, "ai_card_design", { ref: randomUUID(), meta: { subject: who.kind } });
  return withVisitor(NextResponse.json({ ...run.result, quota: run.quota }), who);
}

/** Remaining AI designs for the current visitor, so the designer can show "2 of 3 left" before generating. */
export async function GET(req: Request) {
  const store = new URL(req.url).searchParams.get("store") ?? "";
  const tenant = store ? await resolveTenant(store) : null;
  if (!tenant || tenant.status === "suspended" || tenant.status === "cancelled") return NextResponse.json({ error: "Store not found" }, { status: 404 });
  const who = await identify(tenant.id);
  const quota = await designQuota(tenant.id, who.subject, await planDesignLimit(tenant));
  return withVisitor(NextResponse.json({ quota }), who);
}

/* identity for the quota: logged-in customer, else an anonymous visitor cookie */
const VID = "qp_vid";
async function identify(tenantId: string): Promise<{ subject: string; kind: "customer" | "visitor"; newVid?: string }> {
  const cu = await getCustomer(tenantId);
  if (cu) return { subject: `c:${cu.id}`, kind: "customer" };
  const existing = (await cookies()).get(VID)?.value;
  if (existing && /^[0-9a-f-]{36}$/.test(existing)) return { subject: `v:${existing}`, kind: "visitor" };
  const vid = randomUUID();
  return { subject: `v:${vid}`, kind: "visitor", newVid: vid };
}
function withVisitor(res: NextResponse, who: { newVid?: string }) {
  if (who.newVid) res.cookies.set(VID, who.newVid, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 365 * 86400 });
  return res;
}
