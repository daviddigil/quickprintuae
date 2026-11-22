import { NextResponse } from "next/server";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { audit } from "@/lib/audit";

const num = z.number().finite();
const Choice = z.object({
  value: z.string().min(1).max(60), label: z.string().min(1).max(160),
  addPerUnit: num.optional(), multiplier: num.positive().optional(), flat: num.min(0).optional(),
  hint: z.string().max(160).optional(), widthMm: num.positive().optional(), heightMm: num.positive().optional(),
});
const Group = z.object({
  key: z.string().regex(/^[a-z0-9_]+$/, "Option keys: lowercase letters, numbers, _").max(40), label: z.string().min(1).max(80),
  type: z.enum(["select", "radio"]), required: z.boolean().optional(), default: z.string().optional(),
  choices: z.array(Choice).min(1, "Each option group needs at least one choice"),
});
const ConfigSchema = z.object({
  perPage: z.boolean().optional(), requiresUpload: z.boolean().optional(), acceptedFiles: z.string().max(300).optional(),
  designer: z.boolean().optional(), minQuantity: z.number().int().min(1).optional(),
  quantityPresets: z.array(z.number().int().min(1)).max(30).optional(),
  tiers: z.array(z.object({ min: z.number().int().min(1), unitPrice: num.min(0) })).min(1, "Add at least one price tier"),
  optionGroups: z.array(Group).max(20),
}).superRefine((c, ctx) => {
  const keys = c.optionGroups.map((g) => g.key);
  if (new Set(keys).size !== keys.length) ctx.addIssue({ code: "custom", message: "Option group keys must be unique" });
  c.optionGroups.forEach((g) => {
    const vals = g.choices.map((x) => x.value);
    if (new Set(vals).size !== vals.length) ctx.addIssue({ code: "custom", message: `Choice values in "${g.label}" must be unique` });
    if (g.default && !vals.includes(g.default)) ctx.addIssue({ code: "custom", message: `Default for "${g.label}" isn't one of its choices` });
  });
});
const Body = z.object({
  name: z.string().min(2).max(120), slug: z.string().regex(/^[a-z0-9-]+$/, "Slug: lowercase letters, numbers, dashes").max(80),
  description: z.string().max(2000), imageUrl: z.string().url().or(z.literal("")),
  turnaroundHours: z.number().int().min(0).max(24 * 60), active: z.boolean(), featured: z.boolean(), sortOrder: z.number().int(),
  config: ConfigSchema,
});

async function staffTenant() {
  const cu = await getCurrentUser();
  if (!cu || !cu.session.tid || !["owner", "staff"].includes(cu.user.role)) return null;
  return cu.session.tid;
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const tid = await staffTenant();
  if (!tid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues.map((i) => `${i.path.join(".") || "config"}: ${i.message}`).join("; ") }, { status: 400 });
  const v = parsed.data;
  const clash = await db.query.products.findFirst({ where: and(eq(schema.products.tenantId, tid), eq(schema.products.slug, v.slug), ne(schema.products.id, id)) });
  if (clash) return NextResponse.json({ error: "Another product already uses this slug" }, { status: 409 });
  const [p] = await db.update(schema.products).set({ ...v, imageUrl: v.imageUrl || null })
    .where(and(eq(schema.products.id, id), eq(schema.products.tenantId, tid))).returning({ id: schema.products.id });
  if (!p) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await audit("product.update", { productId: id, name: v.name }, tid);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const tid = await staffTenant();
  if (!tid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const [p] = await db.delete(schema.products).where(and(eq(schema.products.id, id), eq(schema.products.tenantId, tid))).returning({ id: schema.products.id });
  if (!p) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await audit("product.delete", { productId: id }, tid);
  return NextResponse.json({ ok: true });
}
