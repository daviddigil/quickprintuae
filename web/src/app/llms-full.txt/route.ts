import { buildLlmsFull } from "@/lib/seo/knowledge";

export const dynamic = "force-dynamic";

export async function GET() {
  return new Response(await buildLlmsFull(), { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, s-maxage=3600, stale-while-revalidate=86400", "x-robots-tag": "all" } });
}
