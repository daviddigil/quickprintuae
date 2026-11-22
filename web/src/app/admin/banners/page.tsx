import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireStaff } from "@/lib/auth";
import { PageHeader } from "@/components/admin/PageHeader";
import { BannerStudio } from "@/components/admin/BannerStudio";
import { env } from "@/lib/env";

export const metadata = { title: "Banners" };

export default async function BannersPage() {
  const { tenant } = await requireStaff();
  const banners = await db.query.banners.findMany({ where: eq(schema.banners.tenantId, tenant.id), orderBy: [asc(schema.banners.sortOrder)] });
  const engine = env.imageApiUrl ? "open-source model" : env.geminiKey ? "Nano Banana" : "templates";
  return (
    <div>
      <PageHeader title="Banners" subtitle="Create promotional banners with AI and edit them with plain-English instructions. Active banners appear on your storefront home page." />
      <BannerStudio initial={banners.map((b) => ({ id: b.id, title: b.title, subtitle: b.subtitle, prompt: b.prompt, active: b.active, source: b.source, version: b.version }))} engine={engine} />
    </div>
  );
}
