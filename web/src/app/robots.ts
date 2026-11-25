import type { MetadataRoute } from "next";
import { abs } from "@/lib/seo/site";

/** Private / app-only areas: never crawled. (Storefront private paths use wildcards, supported by Google and Bing.) */
const DISALLOW = ["/admin", "/superadmin", "/api/", "/login", "/logout", "/uploads/", "/s/*/cart", "/s/*/checkout", "/s/*/account", "/s/*/orders", "/s/*/walk-in/status"];

/** AI search / answer crawlers (fetch pages to answer a user's question or build a search index). */
const AI_SEARCH = ["OAI-SearchBot", "ChatGPT-User", "Claude-SearchBot", "Claude-User", "PerplexityBot", "Perplexity-User", "Bingbot"];
/** AI training crawlers. */
const AI_TRAINING = ["GPTBot", "ClaudeBot", "anthropic-ai", "CCBot", "Google-Extended", "Applebot-Extended"];

/**
 * AI_CRAWLERS = allow (default: we WANT to be discovered and cited) | search-only (allow answer/search bots, block training bots) | block
 */
export default function robots(): MetadataRoute.Robots {
  const mode = (process.env.AI_CRAWLERS || "allow").toLowerCase();
  const rules: MetadataRoute.Robots["rules"] = [{ userAgent: "*", allow: "/", disallow: DISALLOW }];
  if (mode === "block") rules.push({ userAgent: [...AI_SEARCH.filter((b) => b !== "Bingbot"), ...AI_TRAINING], disallow: "/" });
  else if (mode === "search-only") {
    rules.push({ userAgent: AI_SEARCH, allow: "/", disallow: DISALLOW });
    rules.push({ userAgent: AI_TRAINING, disallow: "/" });
  } else rules.push({ userAgent: [...AI_SEARCH, ...AI_TRAINING], allow: "/", disallow: DISALLOW });
  return { rules, sitemap: abs("/sitemap.xml") };
}
