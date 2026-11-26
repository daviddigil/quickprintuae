/** Shared zod validation for owner product create (POST) and update (PUT). Pure: no server-only imports so it is unit tested. */
import { z } from "zod";

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
const PersonalisationField = z.object({
  key: z.string().regex(/^[a-z0-9_]+$/, "Personalisation keys: lowercase letters, numbers, _").min(1).max(40),
  label: z.string().min(1).max(80), type: z.enum(["text", "textarea"]),
  maxLength: z.number().int().min(1, "Max length must be at least 1").max(500, "Max length can be at most 500"),
  required: z.boolean().optional(), placeholder: z.string().max(120).optional(), flat: num.min(0).optional(),
});
const pct = z.number().finite().min(0, "Percentages are 0 to 100").max(100, "Percentages are 0 to 100");
const Mockup = z.object({ enabled: z.boolean(), x: pct, y: pct, w: pct, h: pct }).superRefine((m, ctx) => {
  if (m.x + m.w > 100.0001 || m.y + m.h > 100.0001) ctx.addIssue({ code: "custom", message: "Print area must stay inside the photo" });
});
export const ConfigSchema = z.object({
  perPage: z.boolean().optional(), requiresUpload: z.boolean().optional(), acceptedFiles: z.string().max(300).optional(),
  designer: z.boolean().optional(), minQuantity: z.number().int().min(1).optional(),
  quantityPresets: z.array(z.number().int().min(1)).max(30).optional(),
  tiers: z.array(z.object({ min: z.number().int().min(1), unitPrice: num.min(0) })).min(1, "Add at least one price tier"),
  optionGroups: z.array(Group).max(20),
  personalisation: z.object({ fields: z.array(PersonalisationField).max(10), artwork: z.enum(["none", "optional", "required"]) }).optional(),
  mockup: Mockup.optional(),
  quote: z.object({ enabled: z.boolean(), label: z.string().max(40).optional() }).optional(),
}).superRefine((c, ctx) => {
  const keys = c.optionGroups.map((g) => g.key);
  if (new Set(keys).size !== keys.length) ctx.addIssue({ code: "custom", message: "Option group keys must be unique" });
  c.optionGroups.forEach((g) => {
    const vals = g.choices.map((x) => x.value);
    if (new Set(vals).size !== vals.length) ctx.addIssue({ code: "custom", message: `Choice values in "${g.label}" must be unique` });
    if (g.default && !vals.includes(g.default)) ctx.addIssue({ code: "custom", message: `Default for "${g.label}" isn't one of its choices` });
  });
  const pk = (c.personalisation?.fields ?? []).map((f) => f.key);
  if (new Set(pk).size !== pk.length) ctx.addIssue({ code: "custom", path: ["personalisation"], message: "Personalisation field keys must be unique" });
});

/** A photo is an https URL or a photo uploaded to this platform (/api/product-images/...). */
export const ImageRef = z.string().max(500).refine((s) => /^\/api\/product-images\/[0-9a-f-]{36}\/\d{4}-\d{2}\/[0-9a-f-]{36}\.(png|jpg|webp)$/.test(s) || /^https?:\/\/[^\s]+$/.test(s), "Photos must be uploaded images or web URLs");

export const ProductBody = z.object({
  kind: z.enum(["document", "confidential_document", "photo", "passport_photo", "photo_frame", "business_card", "flyer", "brochure", "notebook", "poster", "sticker", "merchandise", "gift_pack", "other"]).optional(),
  name: z.string().min(2).max(120), slug: z.string().regex(/^[a-z0-9-]+$/, "Slug: lowercase letters, numbers, dashes").min(1).max(80),
  description: z.string().max(2000), imageUrl: ImageRef.or(z.literal("")),
  category: z.string().trim().max(60).nullish(),
  /** extra gallery photos; imageUrl stays the cover */
  images: z.array(ImageRef).max(8, "Up to 8 extra photos").optional(),
  internal: z.object({ costPrice: z.number().finite().min(0).max(1_000_000).optional(), note: z.string().max(500).optional() }).optional(),
  turnaroundHours: z.number().int().min(0).max(24 * 60), active: z.boolean(), featured: z.boolean(), sortOrder: z.number().int(),
  config: ConfigSchema,
});
export type ProductBodyInput = z.infer<typeof ProductBody>;

export const issuesText = (e: z.ZodError) => e.issues.map((i) => `${i.path.join(".") || "config"}: ${i.message}`).join("; ");

/** Normalises the optional columns for insert/update (empty category -> null, missing internal/images keep defaults). */
export function toColumns(v: ProductBodyInput) {
  const { kind, internal, images, category, imageUrl, ...rest } = v;
  const cost = internal?.costPrice, note = internal?.note?.trim();
  return {
    ...rest, ...(kind ? { kind } : {}), imageUrl: imageUrl || null, category: category?.trim() || null,
    ...(images ? { images } : {}),
    ...(internal ? { internal: { ...(cost !== undefined ? { costPrice: cost } : {}), ...(note ? { note } : {}) } } : {}),
  };
}
