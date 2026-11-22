import { NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { generateBanner } from "@/server/ai/banner";
import { putFile, getFile } from "@/server/storage";

const Body = z.object({
  prompt: z.string().trim().min(3).max(600),
  title: z.string().trim().max(60).optional(),
  subtitle: z.string().trim().max(120).optional(),
  linkUrl: z.string().max(300).optional(),
  /** set to edit an existing banner with Nano Banana instead of creating a new one */
  editBannerId: z.string().uuid().optional(),
});

const EXT: Record<string, string> = { "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp", "image/svg+xml": ".svg" };
const buckets = new Map<string, number[]>();

async function staff() {
  const cu = await getCurrentUser();
  if (!cu || !cu.session.tid || !["owner", "staff"].includes(cu.user.role)) return null;
  const tenant = await db.query.tenants.findFirst({ where: eq(schema.tenants.id, cu.session.tid) });
  return tenant ? { cu, tenant } : null;
}

export async function GET() {
  const s = await staff();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rows = await db.select().from(schema.banners).where(eq(schema.banners.tenantId, s.tenant.id)).orderBy(asc(schema.banners.sortOrder));
  return NextResponse.json({ banners: rows });
}

export async function POST(req: Request) {
  const s = await staff();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { tenant, cu } = s;
  if (tenant.settings.aiDesignerEnabled === false) return NextResponse.json({ error: "AI features are turned off in Store settings." }, { status: 403 });

  // simple per-tenant limit: 15 generations / hour (image calls cost money)
  const now = Date.now(), hits = (buckets.get(tenant.id) ?? []).filter((t) => now - t < 3600_000);
  if (hits.length >= 15) return NextResponse.json({ error: "Hourly banner limit reached. Try again later." }, { status: 429 });
  buckets.set(tenant.id, [...hits, now]);

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  const b = parsed.data;

  let existing: typeof schema.banners.$inferSelect | undefined;
  let source: { data: Buffer; mime: string } | undefined;
  if (b.editBannerId) {
    existing = await db.query.banners.findFirst({ where: and(eq(schema.banners.id, b.editBannerId), eq(schema.banners.tenantId, tenant.id)) });
    if (!existing) return NextResponse.json({ error: "Banner not found" }, { status: 404 });
    // SVG templates can't be fed to the image model as a source; edit then becomes a fresh generation
    if (existing.mime !== "image/svg+xml") source = { data: await getFile(existing.storageKey, false), mime: existing.mime };
  }

  const result = await generateBanner({
    prompt: b.prompt, shopName: tenant.name, brandColor: tenant.primaryColor, title: b.title ?? existing?.title, subtitle: b.subtitle ?? existing?.subtitle, source,
  });
  const key = await putFile(tenant.id, result.data, EXT[result.mime] ?? ".png", false);

  let banner;
  if (existing) {
    [banner] = await db.update(schema.banners).set({
      storageKey: key, mime: result.mime, source: result.source, prompt: b.prompt, version: existing.version + 1, updatedAt: new Date(),
      title: b.title ?? existing.title, subtitle: b.subtitle ?? existing.subtitle,
    }).where(eq(schema.banners.id, existing.id)).returning();
  } else {
    [banner] = await db.insert(schema.banners).values({
      tenantId: tenant.id, title: b.title ?? "", subtitle: b.subtitle ?? "", linkUrl: b.linkUrl || null, prompt: b.prompt,
      storageKey: key, mime: result.mime, source: result.source, sortOrder: Date.now() % 1_000_000,
    }).returning();
  }
  await audit(existing ? "banner.edit" : "banner.create", { bannerId: banner.id, source: result.source, by: cu.user.id }, tenant.id);
  return NextResponse.json({ banner, note: result.note ?? null });
}
