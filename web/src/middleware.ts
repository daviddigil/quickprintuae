import { NextResponse, type NextRequest } from "next/server";

const ROOT = (process.env.ROOT_DOMAIN || "localhost:3000").toLowerCase();
/** Hosts that are never a tenant custom domain: localhost, IPs (v4/v6), single-label names (LAN computer names), docker hosts. */
const isPlatformHost = (h: string) => { const n = h.split(":")[0].replace(/^\[|\]$/g, ""); return !n || n === "localhost" || n === "host.docker.internal" || /^\d{1,3}(\.\d{1,3}){3}$/.test(n) || h.startsWith("[") || !n.includes("."); };
/** Paths served as-is on every host (never rewritten to a storefront). /sitemap.xml, /robots.txt and /llms.txt are NOT here: on a shop host they belong to the shop. */
const PASSTHROUGH = ["/s/", "/api/", "/_next/", "/admin", "/superadmin", "/login", "/logout", "/forgot-password", "/reset-password", "/signup", "/uploads/", "/favicon", "/icon", "/apple-icon", "/opengraph-image", "/twitter-image", "/brand/", "/manifest.webmanifest", "/.well-known/"];
/** Never indexed: sensitive / app-only areas */
const PRIVATE = ["/admin", "/superadmin", "/login", "/logout", "/api/", "/uploads/"];

/**
 * Multi-tenant host routing:
 *   desco.quickprint.ae/p/flyers  -> /s/desco/p/flyers
 *   print.myshop.ae/              -> /s/~print.myshop.ae/
 *   quickprint.ae / localhost     -> platform marketing site (no rewrite)
 *
 * It also stamps two request headers read by the root layout for SEO:
 *   x-locale     en | ar   (Arabic marketing pages live under /ar and only on the platform host)
 *   x-seo-scope  platform | store | private
 *   x-seo-path   the requested path (so the root layout can add page-specific structured data)
 */
export function middleware(req: NextRequest) {
  const host = (req.headers.get("host") ?? "").toLowerCase();
  const { pathname } = req.nextUrl;

  let tenantKey: string | null = null;
  if (host === ROOT || host === `www.${ROOT}` || isPlatformHost(host)) {
    tenantKey = null;
  } else if (host.endsWith(`.${ROOT}`)) {
    const sub = host.slice(0, -(ROOT.length + 1));
    if (sub && sub !== "www" && sub !== "app") tenantKey = sub;
  } else if (host) {
    tenantKey = `~${host.split(":")[0]}`;
  }

  const locale = !tenantKey && (pathname === "/ar" || pathname.startsWith("/ar/")) ? "ar" : "en";
  const scope = PRIVATE.some((p) => pathname.startsWith(p)) ? "private" : pathname.startsWith("/s/") || tenantKey ? "store" : "platform";
  const rh = new Headers(req.headers);
  rh.set("x-locale", locale);
  rh.set("x-seo-scope", scope);
  rh.set("x-seo-path", pathname);

  if (PASSTHROUGH.some((p) => pathname.startsWith(p)) || !tenantKey) return NextResponse.next({ request: { headers: rh } });

  const url = req.nextUrl.clone();
  url.pathname = `/s/${tenantKey}${pathname === "/" ? "" : pathname}`;
  return NextResponse.rewrite(url, { request: { headers: rh } });
}

export const config = { matcher: ["/((?!_next/static|_next/image|.*\\.(?:png|jpg|svg|ico|webp)$).*)"] };
