import type { NextConfig } from "next";

/** Areas that must never appear in search results (belt and braces on top of robots.txt and page metadata). */
const NOINDEX_SOURCES = [
  "/admin/:path*", "/superadmin/:path*", "/api/:path*", "/login", "/logout", "/uploads/:path*",
  // storefront private pages, on the platform host (/s/<slug>/…) and on a shop's own host (/…)
  "/s/:tenant/cart", "/s/:tenant/checkout", "/s/:tenant/account", "/s/:tenant/orders/:path*", "/s/:tenant/walk-in/status/:path*",
  "/cart", "/checkout", "/account", "/orders/:path*", "/walk-in/status/:path*",
];

const nextConfig: NextConfig = {
  output: "standalone",
  // lets parallel dev servers / CI use separate build dirs
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  experimental: { serverActions: { bodySizeLimit: "50mb" } },
  async headers() {
    return [
      ...NOINDEX_SOURCES.map((source) => ({ source, headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] })),
      { source: "/robots.txt", headers: [{ key: "Cache-Control", value: "public, s-maxage=3600, stale-while-revalidate=86400" }] },
      { source: "/sitemap.xml", headers: [{ key: "Cache-Control", value: "public, s-maxage=3600, stale-while-revalidate=86400" }] },
    ];
  },
};

export default nextConfig;
