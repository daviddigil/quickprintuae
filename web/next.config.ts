import type { NextConfig } from "next";

/** Areas that must never appear in search results (belt and braces on top of robots.txt and page metadata). */
const NOINDEX_SOURCES = [
  "/admin/:path*", "/superadmin/:path*", "/api/:path*", "/login", "/logout", "/uploads/:path*",
  // storefront private pages, on the platform host (/s/<slug>/…) and on a shop's own host (/…)
  "/s/:tenant/cart", "/s/:tenant/checkout", "/s/:tenant/account", "/s/:tenant/orders/:path*", "/s/:tenant/walk-in/status/:path*",
  "/cart", "/checkout", "/account", "/orders/:path*", "/walk-in/status/:path*",
];

/**
 * Content-Security-Policy. Report-only by default; set CSP_ENFORCE=1 AT BUILD TIME to enforce (next.config headers are baked
 * into the build, so pass it as a Docker build arg / env during `next build`). script-src keeps 'unsafe-inline' because Next
 * injects inline bootstrap scripts and we have no per-request nonce yet (see docs/SECURITY.md, known gaps).
 * Third parties: Stripe (js/api/hooks), Cloudflare Turnstile (challenges.cloudflare.com, only used when keys are set), Meta (WhatsApp embedded signup), Google Fonts (card designer).
 */
const dev = process.env.NODE_ENV !== "production";
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""} https://js.stripe.com https://connect.facebook.net https://challenges.cloudflare.com`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: data:",
  "worker-src 'self' blob:",
  `connect-src 'self' https://api.stripe.com https://m.stripe.network https://graph.facebook.com https://www.facebook.com https://connect.facebook.net https://challenges.cloudflare.com${dev ? " ws: wss:" : ""}`,
  "frame-src https://challenges.cloudflare.com https://js.stripe.com https://hooks.stripe.com https://m.stripe.network https://www.facebook.com https://web.facebook.com https://staticxx.facebook.com",
  "form-action 'self' https://hooks.stripe.com https://*.stripe.com https://www.facebook.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
].join("; ");

const SECURITY_HEADERS = [
  { key: process.env.CSP_ENFORCE === "1" ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only", value: CSP },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: 'camera=(), microphone=(), geolocation=(), payment=(self "https://js.stripe.com" "https://m.stripe.network"), interest-cohort=()' },
  { key: "X-Frame-Options", value: "DENY" }, // report-only CSP ignores frame-ancestors, so also send the legacy header
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" }, // popups needed for Facebook/Stripe flows
  ...(dev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  output: "standalone",
  // lets parallel dev servers / CI use separate build dirs
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  experimental: { serverActions: { bodySizeLimit: "50mb" } },
  async headers() {
    return [
      { source: "/:path*", headers: SECURITY_HEADERS },
      ...NOINDEX_SOURCES.map((source) => ({ source, headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] })),
      { source: "/robots.txt", headers: [{ key: "Cache-Control", value: "public, s-maxage=3600, stale-while-revalidate=86400" }] },
      { source: "/sitemap.xml", headers: [{ key: "Cache-Control", value: "public, s-maxage=3600, stale-while-revalidate=86400" }] },
    ];
  },
};

export default nextConfig;
