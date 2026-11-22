import "server-only";
import { env } from "@/lib/env";

/**
 * Banner generation / editing with Nano Banana (Gemini image models) via the Gemini REST API.
 * Without GEMINI_API_KEY (or on API failure when `allowFallback`), a branded SVG template is produced
 * so the feature always works offline.
 *
 * Request shape (Gemini API, generateContent):
 *   POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent
 *   header x-goog-api-key; body { contents: [{ parts: [{ text }, { inline_data: { mime_type, data } }?] }] }
 *   response: candidates[0].content.parts[] with { inlineData: { mimeType, data } } for the image.
 * NOTE: not verified against the live API from this sandbox (network-restricted) — test with a real key.
 */
export interface BannerInput {
  prompt: string;
  shopName: string;
  brandColor: string;
  title?: string;
  subtitle?: string;
  /** existing banner image to edit (nano banana edit mode) */
  source?: { data: Buffer; mime: string };
  aspect?: "wide" | "square";
}
export interface BannerResult { data: Buffer; mime: string; source: "nano-banana" | "open-model" | "template"; note?: string }

const GEMINI_BASE = process.env.GEMINI_API_BASE ?? "https://generativelanguage.googleapis.com/v1beta";

export function buildBannerPrompt(i: BannerInput): string {
  const base = i.source
    ? `Edit this banner image for a UAE print shop called "${i.shopName}". Keep the layout and brand feel unless told otherwise. Change requested: ${i.prompt}.`
    : `Design a wide promotional web banner (about 3:1, 1536x512 feel) for a UAE print shop called "${i.shopName}". Brief: ${i.prompt}. Use a clean modern look with the brand colour ${i.brandColor} as the main accent.`;
  const text = [i.title && `Headline text to show exactly: "${i.title}".`, i.subtitle && `Sub-headline: "${i.subtitle}".`].filter(Boolean).join(" ");
  return `${base} ${text} Keep all text crisp, correctly spelled and inside a safe margin. No watermarks, no fake logos.`;
}

async function callGemini(i: BannerInput): Promise<BannerResult> {
  const parts: Record<string, unknown>[] = [{ text: buildBannerPrompt(i) }];
  if (i.source) parts.push({ inline_data: { mime_type: i.source.mime, data: i.source.data.toString("base64") } });
  const res = await fetch(`${GEMINI_BASE}/models/${env.geminiImageModel}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": env.geminiKey! },
    body: JSON.stringify({ contents: [{ parts }] }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = await res.json() as { candidates?: { content?: { parts?: { inlineData?: { mimeType: string; data: string }; inline_data?: { mime_type: string; data: string } }[] } }[]; promptFeedback?: { blockReason?: string } };
  const img = json.candidates?.[0]?.content?.parts?.map((p) => p.inlineData ?? (p.inline_data && { mimeType: p.inline_data.mime_type, data: p.inline_data.data })).find(Boolean);
  if (!img) throw new Error(json.promptFeedback?.blockReason ? `Blocked: ${json.promptFeedback.blockReason}` : "Gemini returned no image");
  return { data: Buffer.from(img.data, "base64"), mime: img.mimeType || "image/png", source: "nano-banana" };
}

const esc = (s: string) => s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" }[c]!));

/** Offline template: gradient in the brand colour, geometric accents, headline + subtitle. */
export function templateBanner(i: BannerInput): BannerResult {
  const w = i.aspect === "square" ? 1080 : 1536, h = i.aspect === "square" ? 1080 : 512;
  const c = /^#[0-9a-f]{6}$/i.test(i.brandColor) ? i.brandColor : "#e11d48";
  const title = esc((i.title || i.shopName).slice(0, 48)), sub = esc((i.subtitle || i.prompt).slice(0, 90));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c}"/><stop offset="1" stop-color="#0f172a"/></linearGradient></defs>
<rect width="${w}" height="${h}" fill="url(#g)"/>
<circle cx="${w * 0.88}" cy="${h * 0.2}" r="${h * 0.55}" fill="#fff" opacity=".08"/><circle cx="${w * 0.78}" cy="${h * 0.95}" r="${h * 0.4}" fill="#fff" opacity=".1"/>
<rect x="${w * 0.06}" y="${h * 0.3}" width="64" height="6" rx="3" fill="#fff"/>
<text x="${w * 0.06}" y="${h * 0.55}" font-family="Arial,Helvetica,sans-serif" font-weight="800" font-size="${h * 0.14}" fill="#fff">${title}</text>
<text x="${w * 0.06}" y="${h * 0.72}" font-family="Arial,Helvetica,sans-serif" font-size="${h * 0.062}" fill="#fff" opacity=".92">${sub}</text>
</svg>`;
  return { data: Buffer.from(svg), mime: "image/svg+xml", source: "template" };
}

/**
 * Open-source / self-hosted model (e.g. Qwen-Image, Z-Image-Turbo, FLUX.1 schnell) behind any server that exposes
 * the OpenAI-compatible `POST {IMAGE_API_URL}/v1/images/generations` (LocalAI, ComfyUI/diffusers wrappers, vLLM-Omni, …).
 * No image-edit endpoint is assumed: an "edit" re-generates from the new instructions.
 */
async function callOpenAICompatible(i: BannerInput): Promise<BannerResult> {
  const res = await fetch(`${env.imageApiUrl!.replace(/\/$/, "")}/v1/images/generations`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(env.imageApiKey ? { authorization: `Bearer ${env.imageApiKey}` } : {}) },
    body: JSON.stringify({
      model: env.imageApiModel, prompt: buildBannerPrompt({ ...i, source: undefined, prompt: i.source ? `${i.prompt} (revise the previous banner accordingly)` : i.prompt }),
      size: i.aspect === "square" ? "1024x1024" : "1536x512", n: 1, response_format: "b64_json",
    }),
    signal: AbortSignal.timeout(180_000),
  });
  if (!res.ok) throw new Error(`Image API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = await res.json() as { data?: { b64_json?: string }[] };
  const b64 = json.data?.[0]?.b64_json;
  if (!b64) throw new Error("Image API returned no image");
  return { data: Buffer.from(b64, "base64"), mime: "image/png", source: "open-model" };
}

export async function generateBanner(i: BannerInput): Promise<BannerResult> {
  // order: self-hosted open model (free) -> Nano Banana -> template
  const attempts: [string, () => Promise<BannerResult>][] = [];
  if (env.imageApiUrl) attempts.push(["Open-source image model", () => callOpenAICompatible(i)]);
  if (env.geminiKey) attempts.push(["Nano Banana", () => callGemini(i)]);
  if (!attempts.length) return { ...templateBanner(i), note: "No image model configured (IMAGE_API_URL or GEMINI_API_KEY) — used a template banner." };
  const errors: string[] = [];
  for (const [name, run] of attempts) {
    try { return await run(); } catch (e) { console.error(`banner generation failed (${name})`, e); errors.push(`${name}: ${(e as Error).message}`); }
  }
  return { ...templateBanner(i), note: `Image models unavailable (${errors.join("; ")}) — used a template banner.` };
}
