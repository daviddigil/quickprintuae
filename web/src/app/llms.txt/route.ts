import { buildLlmsTxt } from "@/lib/seo/knowledge";

export const dynamic = "force-dynamic";

/** llmstxt.org index for AI assistants. Served as text/plain so browsers display it. */
export async function GET() {
  return new Response(await buildLlmsTxt(), { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, s-maxage=3600, stale-while-revalidate=86400", "x-robots-tag": "all" } });
}
