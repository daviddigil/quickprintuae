// Adds the Printed Mug and T-shirt merch templates (copied from ALL_TEMPLATES) to a shop, with photos, categories and an internal cost price.
// Usage: npx tsx e2e/merch-seed.ts <slug> <imageBase>   (used by e2e/merch-store.mjs)
import postgres from "postgres";
import { ALL_TEMPLATES } from "../src/lib/catalog-defaults";

const [slug, imageBase] = process.argv.slice(2);
if (!slug || !imageBase) throw new Error("usage: merch-seed.ts <slug> <imageBase>");
const sql = postgres(process.env.DATABASE_URL ?? "postgres://qp:qp@localhost:5432/quickprint");
async function main() {
const [tenant] = await sql`select id from tenants where slug = ${slug}`;
if (!tenant) throw new Error("no such shop " + slug);

const mug = ALL_TEMPLATES.find((t) => t.slug === "printed-mug")!;
const tee = structuredClone(ALL_TEMPLATES.find((t) => t.slug === "t-shirt")!);
// the T-shirt in this test requires a text field and artwork (the shipped template has both optional)
tee.config.personalisation = { artwork: "required", fields: [{ key: "text", label: "Text under the design", type: "text", maxLength: 12, required: true }] };
mug.config.quote = { enabled: true };

const rows = [
  { t: mug, images: [`${imageBase}/mug.svg`, `${imageBase}/mug2.svg`], internal: { costPrice: 11.11, note: "secret-supplier-note" }, sort: 20 },
  { t: tee, images: [`${imageBase}/tee.svg`], internal: { costPrice: 22.22, note: "secret-tee-note" }, sort: 21 },
];
for (const r of rows) {
  await sql`insert into products (tenant_id, kind, name, slug, description, image_url, images, category, turnaround_hours, sort_order, featured, config, internal)
    values (${tenant.id}, ${r.t.kind}, ${r.t.name}, ${r.t.slug}, ${r.t.description}, ${r.images[0]}, ${sql.json(r.images.slice(1))}, ${r.t.category ?? null}, ${r.t.turnaroundHours}, ${r.sort}, false, ${sql.json(r.t.config as never)}, ${sql.json(r.internal)})`;
}
await sql.end();
console.log("seeded", rows.map((r) => r.t.slug).join(","));
}
main().catch((e) => { console.error(e); process.exit(1); });
