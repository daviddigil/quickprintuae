import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireStorefrontTenant } from "@/lib/tenant";
import { Configurator, type ConfiguratorInitial } from "@/components/store/configurator";

type P = { params: Promise<{ tenant: string; slug: string }>; searchParams: Promise<{ cfg?: string }> };

async function load(p: P["params"]) {
  const { tenant: t, slug } = await p;
  const tenant = await requireStorefrontTenant(t);
  const product = await db.query.products.findFirst({
    where: and(eq(schema.products.tenantId, tenant.id), eq(schema.products.slug, slug), eq(schema.products.active, true)),
  });
  if (!product) notFound();
  return { tenant, product };
}

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { product } = await load(params);
  return { title: product.name, description: product.description };
}

function parseCfg(cfg?: string): ConfiguratorInitial | undefined {
  if (!cfg) return undefined;
  try {
    const v = JSON.parse(Buffer.from(cfg, "base64url").toString("utf8"));
    const selections = v && typeof v.selections === "object" ? Object.fromEntries(Object.entries(v.selections).filter(([, x]) => typeof x === "string")) as Record<string, string> : undefined;
    return { selections, quantity: Number.isInteger(v.quantity) ? v.quantity : undefined, pages: Number.isInteger(v.pages) ? v.pages : undefined };
  } catch { return undefined; }
}

export default async function ProductPage({ params, searchParams }: P) {
  const { tenant, product } = await load(params);
  const { cfg } = await searchParams;
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <nav className="mb-4 text-sm text-slate-500"><a href={`/s/${tenant.slug}`} className="hover:text-slate-900">Home</a> / {product.name}</nav>
      <h1 className="text-3xl font-extrabold tracking-tight">{product.name}</h1>
      <p className="mt-2 max-w-2xl text-slate-600">{product.description}</p>
      <div className="mt-8">
        <Configurator
          store={tenant.slug}
          product={{ id: product.id, slug: product.slug, name: product.name, kind: product.kind, description: product.description, turnaroundHours: product.turnaroundHours, config: product.config }}
          aiEnabled={tenant.settings?.aiDesignerEnabled !== false}
          vatRate={tenant.settings?.vatRate ?? 5}
          pricesIncludeVat={!!tenant.settings?.pricesIncludeVat}
          initial={parseCfg(cfg)}
        />
      </div>
    </div>
  );
}
