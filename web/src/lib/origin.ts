/**
 * The address the BROWSER used (works behind Docker port mappings and reverse proxies).
 * Inside a container `req.url` is the internal address (e.g. http://0.0.0.0:3000), which must never be sent back in a redirect.
 */
export function publicOrigin(req: Request) {
  const h = req.headers;
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? new URL(req.url).protocol.replace(":", "");
  // never leak a wildcard bind address
  if (!host || /^(0\.0\.0\.0|\[::\])(:|$)/.test(host)) return process.env.APP_URL || new URL(req.url).origin;
  return `${proto}://${host}`;
}
