import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { CardDesign } from "@/lib/types";
import { env } from "@/lib/env";
import { CARD_FONTS } from "@/components/card-designer/fonts";
import { sanitizeDesign } from "@/components/card-designer/sanitize";
import { templateDesigns, type CardDetails } from "@/components/card-designer/templates";

/* ---------- structured output schema (mirrors CardDesign in lib/types.ts) ---------- */
const Text = z.object({
  id: z.string(), type: z.literal("text"), x: z.number(), y: z.number(), w: z.number(),
  text: z.string(), fontSize: z.number(), fontFamily: z.enum(CARD_FONTS),
  fontWeight: z.union([z.literal(400), z.literal(500), z.literal(600), z.literal(700), z.literal(800)]),
  color: z.string(), align: z.enum(["left", "center", "right"]), italic: z.boolean().optional(), letterSpacing: z.number().optional(),
});
const Rect = z.object({ id: z.string(), type: z.literal("rect"), x: z.number(), y: z.number(), w: z.number(), h: z.number(), fill: z.string(), radius: z.number().optional(), opacity: z.number().optional() });
const Circle = z.object({ id: z.string(), type: z.literal("circle"), x: z.number(), y: z.number(), r: z.number(), fill: z.string(), opacity: z.number().optional() });
const Line = z.object({ id: z.string(), type: z.literal("line"), x: z.number(), y: z.number(), w: z.number(), h: z.number(), color: z.string(), thickness: z.number() });
const Qr = z.object({ id: z.string(), type: z.literal("qr"), x: z.number(), y: z.number(), size: z.number(), value: z.string(), color: z.string().optional() });
const Side = z.object({ background: z.string(), elements: z.array(z.union([Text, Rect, Circle, Line, Qr])) });
const Design = z.object({ name: z.string(), front: Side, back: Side.optional() });
const Output = z.object({ designs: z.array(Design) });

export interface GenerateOptions { widthMm?: number; heightMm?: number; doubleSided?: boolean }
export interface GenerateResult { designs: CardDesign[]; source: "ai" | "template"; note?: string }

const SYSTEM = `You are a senior print designer creating business cards for a UAE print shop.
Coordinates are millimetres from the card's top-left corner. Text elements: (x, y) is the top-left of the text box, w its width; fontSize is in points (1pt = 0.3528mm).
Print rules: keep every text element and QR code at least 4mm inside the trim edge (safe area). Background shapes may bleed past the edge. Minimum text size 6pt; names 10–16pt. Ensure strong contrast (dark text on light backgrounds or vice versa). Do not overlap text elements.
Use only the provided details — never invent phone numbers, emails or addresses. Hex colours only (#rrggbb). Fonts must come from the allowed list.
Make the three designs clearly different in layout and mood (e.g. minimal, bold colour-block, elegant). Arabic text, if given, should use Cairo or Tajawal and align right.`;

function userPrompt(d: CardDetails, W: number, H: number, doubleSided: boolean) {
  const lines = Object.entries({ name: d.name, title: d.title, company: d.company, phone: d.phone, email: d.email, website: d.website, address: d.address, industry: d.industry, style: d.style, brand_colours: d.colors?.join(", ") })
    .filter(([, v]) => v).map(([k, v]) => `- ${k}: ${v}`).join("\n");
  return `Design 3 business card variants, card size ${W} × ${H} mm${doubleSided ? ", with a front and a back side (back: logo-style brand side, company name, optional QR code for the website)" : ", front side only (omit back)"}.
Customer details:
${lines}
Allowed fonts: ${CARD_FONTS.join(", ")}.
If there is no logo, you may create a simple typographic monogram from the company initials using a circle or rect plus text.`;
}

let client: Anthropic | null = null;
const anthropic = () => (client ??= new Anthropic({ apiKey: env.anthropicKey }));

export async function generateCardDesigns(details: CardDetails, opts: GenerateOptions = {}): Promise<GenerateResult> {
  const W = opts.widthMm ?? 85, H = opts.heightMm ?? 55;
  const doubleSided = opts.doubleSided ?? true;
  const fallback = (note?: string): GenerateResult => ({ designs: templateDesigns(details, { widthMm: W, heightMm: H, count: 3, doubleSided }), source: "template", note });

  if (!env.anthropicKey) return fallback();

  try {
    const res = await anthropic().beta.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM,
      output_config: { effort: "low", format: betaZodOutputFormat(Output) },
      messages: [{ role: "user", content: userPrompt(details, W, H, doubleSided) }],
    });
    if (res.stop_reason === "refusal") return fallback("AI designer declined this request; showing templates instead.");
    const out = res.parsed_output;
    if (!out?.designs?.length) return fallback("AI returned no designs; showing templates instead.");

    const designs = out.designs.slice(0, 3).map((d) =>
      sanitizeDesign({ ...d, widthMm: W, heightMm: H, back: doubleSided ? d.back : undefined }, W, H));
    // keep the logo the customer uploaded: inject into designs as a corner element if provided
    if (details.logo) for (const d of designs) {
      const target = d.back ?? d.front;
      target.elements.push({ id: "logo", type: "image", x: W / 2 - 8, y: 5, w: 16, h: 16, src: details.logo, fit: "contain" });
    }
    // top up with templates if the model returned fewer than 3
    if (designs.length < 3) designs.push(...templateDesigns(details, { widthMm: W, heightMm: H, count: 3, doubleSided }).slice(0, 3 - designs.length));
    return { designs, source: "ai" };
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return fallback("AI designer is busy; showing templates instead.");
    if (e instanceof Anthropic.APIError) {
      console.error(`[ai-card] API error ${e.status}`, e.message);
      return fallback("AI designer is unavailable right now; showing templates instead.");
    }
    console.error("[ai-card] failed", e);
    return fallback("AI designer is unavailable right now; showing templates instead.");
  }
}
