import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireStaff } from "@/lib/auth";
import { DEFAULT_PRODUCTS } from "@/lib/catalog-defaults";
import { formatAED } from "@/lib/pricing";
import { Badge, Button, Card, Select, Table } from "@/components/ui";
import { PageHeader } from "@/components/admin/PageHeader";
import { Flash } from "@/components/admin/Flash";
import { addProductFromTemplate, toggleProduct } from "../actions";

export const metadata = { title: "Products" };

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { tenant } = await requireStaff();
  const sp = await searchParams;
  const products = await db.query.products.findMany({ where: eq(schema.products.tenantId, tenant.id), orderBy: [asc(schema.products.sortOrder), asc(schema.products.name)] });
  return (
    <div>
      <PageHeader title="Products & pricing" subtitle="Turn products on/off, edit prices, option groups and quantity tiers."
        action={
          <form action={addProductFromTemplate} className="flex gap-2">
            <Select name="template" className="w-56">{DEFAULT_PRODUCTS.map((p) => <option key={p.slug} value={p.slug}>{p.name}</option>)}</Select>
            <Button>Add from template</Button>
          </form>
        } />
      <Flash sp={sp} />
      <Card>
        <Table head={["Product", "Type", "From", "Turnaround", "Active", "Featured", ""]}>
          {products.map((p) => {
            const from = Math.min(...p.config.tiers.map((t) => t.unitPrice));
            return (
              <tr key={p.id}>
                <td className="px-4 py-3"><Link href={`/admin/products/${p.id}`} className="font-semibold hover:text-primary">{p.name}</Link><div className="text-xs text-on-surface-variant">/{p.slug}</div></td>
                <td className="px-4 py-3"><Badge>{p.kind.replace(/_/g, " ")}</Badge></td>
                <td className="px-4 py-3">{Number.isFinite(from) ? formatAED(from) : "—"}<span className="text-xs text-on-surface-variant"> /{p.config.perPage ? "page" : "unit"}</span></td>
                <td className="px-4 py-3">{p.turnaroundHours}h</td>
                {(["active", "featured"] as const).map((f) => (
                  <td key={f} className="px-4 py-3">
                    <form action={toggleProduct}>
                      <input type="hidden" name="productId" value={p.id} /><input type="hidden" name="field" value={f} />
                      <button className={`relative h-6 w-11 rounded-full transition ${p[f] ? "bg-success" : "bg-surface-highest"}`} aria-label={`Toggle ${f}`}>
                        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${p[f] ? "left-[22px]" : "left-0.5"}`} />
                      </button>
                    </form>
                  </td>
                ))}
                <td className="px-4 py-3 text-right"><Link href={`/admin/products/${p.id}`} className="text-sm font-medium text-primary">Edit</Link></td>
              </tr>
            );
          })}
        </Table>
      </Card>
    </div>
  );
}
