import { abs, siteUrl } from "@/lib/seo/site";

/** RFC 9116 security.txt. Set SECURITY_CONTACT (e.g. mailto:security@yourdomain.ae) in production. */
export async function GET() {
  const host = new URL(siteUrl()).hostname;
  const contact = process.env.SECURITY_CONTACT || `mailto:security@${host}`;
  const expires = new Date(Date.now() + 365 * 86400_000).toISOString();
  const body = [`Contact: ${contact}`, `Expires: ${expires}`, "Preferred-Languages: en, ar", `Canonical: ${abs("/.well-known/security.txt")}`, ""].join("\n");
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=86400" } });
}
