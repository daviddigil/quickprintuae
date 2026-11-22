import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveTenant } from "@/lib/tenant";
import { generateCardDesigns } from "@/server/ai/card-designer";

export const runtime = "nodejs";
export const maxDuration = 120;

const Body = z.object({
  store: z.string().min(1).max(120),
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

  const result = await generateCardDesigns(details, { widthMm, heightMm, doubleSided });
  return NextResponse.json(result);
}
