import { NextResponse, type NextRequest } from "next/server";

const ROOT = (process.env.ROOT_DOMAIN || "localhost:3000").toLowerCase();
/** Hosts that are never a tenant custom domain: localhost, IPs (v4/v6), single-label names (LAN computer names), docker hosts. */
const isPlatformHost = (h: string) => { const n = h.split(":")[0].replace(/^\[|\]$/g, ""); return !n || n === "localhost" || n === "host.docker.internal" || /^\d{1,3}(\.\d{1,3}){3}$/.test(n) || h.startsWith("[") || !n.includes("."); };
const PASSTHROUGH = ["/s/", "/api/", "/_next/", "/admin", "/superadmin", "/login", "/logout", "/signup", "/uploads/", "/favicon"];

/**
 * Multi-tenant host routing:
 *   desco.quickprint.ae/p/flyers  -> /s/desco/p/flyers
 *   print.myshop.ae/              -> /s/~print.myshop.ae/
 *   quickprint.ae / localhost     -> platform marketing site (no rewrite)
 */
export function middleware(req: NextRequest) {
  const host = (req.headers.get("host") ?? "").toLowerCase();
  const { pathname } = req.nextUrl;
  if (PASSTHROUGH.some((p) => pathname.startsWith(p))) return NextResponse.next();

  let tenantKey: string | null = null;
  if (host === ROOT || host === `www.${ROOT}` || isPlatformHost(host)) {
    tenantKey = null;
  } else if (host.endsWith(`.${ROOT}`)) {
    const sub = host.slice(0, -(ROOT.length + 1));
    if (sub && sub !== "www" && sub !== "app") tenantKey = sub;
  } else if (host) {
    tenantKey = `~${host.split(":")[0]}`;
  }
  if (!tenantKey) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = `/s/${tenantKey}${pathname === "/" ? "" : pathname}`;
  return NextResponse.rewrite(url);
}

export const config = { matcher: ["/((?!_next/static|_next/image|.*\\.(?:png|jpg|svg|ico|webp)$).*)"] };
