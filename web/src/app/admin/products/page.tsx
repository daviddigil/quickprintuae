import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { Copy, Plus, ChevronDown, ImageIcon } from "lucide-react";
import { db, schema } from "@/db";
import { requireStaff } from "@/lib/auth";
import { DEFAULT_PRODUCTS, MERCH_TEMPLATES, type DefaultProduct } from "@/lib/catalog-defaults";
import { formatAED } from "@/lib/pricing";
import { Badge, Button, Card, EmptyState, Input, LinkButton, Select, Table } from "@/components/ui";
import { PageHeader } from "@/components/admin/PageHeader";
import { Flash } from "@/components/admin/Flash";
import { addProductFromTemplate, duplicateProduct, toggleProduct } from "../actions";

export const metadata = { title: "Products" };

const templateGroup = (p: DefaultProduct) => (p.kind === "gift_pack" || /gift/i.test(p.category ?? "") ? "Gifts" : p.kind === "merchandise" ? "Merchandise" : "Print");
const GROUPS = (["Print", "Merchandise", "Gifts"] as const).map((g) => ({ g, items: [...DEFAULT_PRODUCTS, ...MERCH_TEMPLATES].filter((p) => templateGroup(p) === g) }));

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string; cat?: string; q?: string }> }) {
  const { tenant } = await requireStaff();
  const sp = await searchParams;
  const all = await db.query.products.findMany({
    where: eq(schema.products.tenantId, tenant.id), orderBy: [asc(schema.products.sortOrder), asc(schema.products.name)],
    columns: { id: true, name: true, slug: true, kind: true, category: true, imageUrl: true, active: true, featured: true, turnaroundHours: true, config: true },
  });
  const catName = (c: string | null) => c?.trim() || "Uncategorised";
  const cats = [...new Set(all.map((p) => catName(p.category)))].sort((a, b) => (a === "Uncategorised" ? 1 : b === "Uncategorised" ? -1 : a.localeCompare(b)));
  const q = (sp.q ?? "").trim().toLowerCase();
  const cat = sp.cat && cats.includes(sp.cat) ? sp.cat : "";
  const products = all.filter((p) => (!cat || catName(p.category) === cat) && (!q || `${p.name} ${p.slug}`.toLowerCase().includes(q)));
  const href = (c: string) => `/admin/products?${new URLSearchParams({ ...(c ? { cat: c } : {}), ...(q ? { q } : {}) })}`;
  const chip = (active: boolean) => `inline-flex min-h-10 items-center rounded-full px-4 text-sm font-semibold [@media(pointer:coarse)]:min-h-11 ${active ? "bg-secondary-container text-on-secondary-container" : "border border-outline-variant text-on-surface-variant hover:text-on-surface"}`;

  return (
    <div>
      <PageHeader title="Products & pricing" subtitle="Add your own custom items, set your own prices, and turn products on or off."
        action={
          <details className="relative">
            <summary className="state-layer inline-flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-shape-md bg-primary px-4 text-sm font-semibold text-on-primary shadow-elev-1 [@media(pointer:coarse)]:min-h-11 [&::-webkit-details-marker]:hidden" data-testid="add-product-menu">
              <Plus size={16} />Add product<ChevronDown size={16} />
            </summary>
            <div className="absolute end-0 z-20 mt-2 w-[min(22rem,90vw)] space-y-4 rounded-shape-lg border border-outline-variant bg-surface-lowest p-4 shadow-elev-3">
              <div>
                <p className="text-sm font-semibold">Build from scratch</p>
                <p className="mb-2 text-xs text-on-surface-variant">Mugs, t-shirts, gift boxes, anything you print. Guided in 6 steps.</p>
                <LinkButton href="/admin/products/new" className="w-full">Build from scratch</LinkButton>
              </div>
              <form action={addProductFromTemplate} className="space-y-2 border-t border-outline-variant pt-4">
                <label htmlFor="tpl" className="text-sm font-semibold">From template</label>
                <p className="text-xs text-on-surface-variant">Starter prices, set your own after adding.</p>
                <Select id="tpl" name="template">
                  {GROUPS.map(({ g, items }) => <optgroup key={g} label={g}>{items.map((p) => <option key={p.slug} value={p.slug}>{p.name}</option>)}</optgroup>)}
                </Select>
                <Button variant="tonal" className="w-full">Add from template</Button>
              </form>
            </div>
          </details>
        } />
      <Flash sp={sp} />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <form action="/admin/products" role="search" className="flex gap-2">
          {cat && <input type="hidden" name="cat" value={cat} />}
          <Input name="q" type="search" defaultValue={sp.q ?? ""} placeholder="Search products" aria-label="Search products" className="w-56" />
          <Button variant="tonal">Search</Button>
        </form>
        <nav aria-label="Product categories" className="flex flex-wrap gap-2">
          <Link href={href("")} className={chip(!cat)} aria-current={!cat ? "page" : undefined}>All ({all.length})</Link>
          {cats.map((c) => (
            <Link key={c} href={href(c)} className={chip(cat === c)} aria-current={cat === c ? "page" : undefined}>{c} ({all.filter((p) => catName(p.category) === c).length})</Link>
          ))}
        </nav>
      </div>

      <Card>
        {products.length === 0 ? (
          <EmptyState title={all.length ? "No products match" : "No products yet"}>
            <p className="mt-1 text-sm">{all.length ? "Try another search or category." : "Add one from a template or build your own."}</p>
          </EmptyState>
        ) : (
          <Table head={["", "Product", "Category", "Type", "From", "Turnaround", "Active", "Featured", ""]}>
            {products.map((p) => {
              const from = Math.min(...p.config.tiers.map((t) => t.unitPrice));
              return (
                <tr key={p.id} data-testid="product-row">
                  <td className="w-16 px-4 py-3">
                    {p.imageUrl
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={p.imageUrl} alt="" width={44} height={44} loading="lazy" className="size-11 rounded-shape-sm border border-outline-variant object-cover" />
                      : <span aria-hidden className="grid size-11 place-items-center rounded-shape-sm bg-surface-container text-outline"><ImageIcon size={18} /></span>}
                  </td>
                  <td className="px-4 py-3"><Link href={`/admin/products/${p.id}`} className="font-semibold hover:text-primary">{p.name}</Link><div className="text-xs text-on-surface-variant">/{p.slug}</div></td>
                  <td className="px-4 py-3 text-on-surface-variant">{p.category || "—"}</td>
                  <td className="px-4 py-3"><Badge>{p.kind.replace(/_/g, " ")}</Badge></td>
                  <td className="px-4 py-3">{Number.isFinite(from) ? formatAED(from) : "—"}<span className="text-xs text-on-surface-variant"> /{p.config.perPage ? "page" : "unit"}</span></td>
                  <td className="px-4 py-3">{p.turnaroundHours}h</td>
                  {(["active", "featured"] as const).map((f) => (
                    <td key={f} className="px-4 py-3">
                      <form action={toggleProduct}>
                        <input type="hidden" name="productId" value={p.id} /><input type="hidden" name="field" value={f} />
                        <button className="grid min-h-11 min-w-11 place-items-center" aria-label={`${p[f] ? "Turn off" : "Turn on"} ${f} for ${p.name}`} aria-pressed={p[f]}>
                          <span className={`relative block h-6 w-11 rounded-full transition ${p[f] ? "bg-success" : "bg-surface-highest"}`}>
                            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-surface-lowest shadow transition ${p[f] ? "start-[22px]" : "start-0.5"}`} />
                          </span>
                        </button>
                      </form>
                    </td>
                  ))}
                  <td className="whitespace-nowrap px-4 py-3 text-end">
                    <form action={duplicateProduct} className="inline">
                      <input type="hidden" name="productId" value={p.id} />
                      <button className="me-3 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-on-surface-variant hover:text-primary" aria-label={`Duplicate ${p.name}`}><Copy size={14} />Duplicate</button>
                    </form>
                    <Link href={`/admin/products/${p.id}`} className="inline-flex min-h-11 items-center text-sm font-medium text-primary">Edit</Link>
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>
    </div>
  );
}
