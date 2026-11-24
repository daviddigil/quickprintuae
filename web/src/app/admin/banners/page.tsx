import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireStaff } from "@/lib/auth";
import { PageHeader } from "@/components/admin/PageHeader";
import { BannerStudio } from "@/components/admin/BannerStudio";
import { env } from "@/lib/env";

export const metadata = { title: "Hero slider" };

export default async function BannersPage() {
  const { tenant } = await requireStaff();
  const banners = await db.query.banners.findMany({ where: eq(schema.banners.tenantId, tenant.id), orderBy: [asc(schema.banners.sortOrder), asc(schema.banners.createdAt)] });
  const engine = env.imageApiUrl ? "open-source model" : env.geminiKey ? "Nano Banana" : "templates";
  return (
    <div>
      <PageHeader title="Hero slider & offers" subtitle="Upload your own offer images (or create them with AI). Live slides appear as a sliding banner at the top of your storefront home page." />
      <BannerStudio engine={engine} aiEnabled={tenant.settings.aiDesignerEnabled !== false} storeUrl={`/s/${tenant.slug}`}
        initial={banners.map((b) => ({
          id: b.id, title: b.title, subtitle: b.subtitle, prompt: b.prompt, active: b.active, source: b.source, version: b.version,
          linkUrl: b.linkUrl ?? "", ctaLabel: b.ctaLabel, startsAt: b.startsAt?.toISOString() ?? null, endsAt: b.endsAt?.toISOString() ?? null,
        }))} />
    </div>
  );
}
