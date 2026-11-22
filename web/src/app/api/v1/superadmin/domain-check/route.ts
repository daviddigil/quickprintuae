import { NextResponse } from "next/server";
import { and, eq, notInArray } from "drizzle-orm";
import { db, schema } from "@/db";

/**
 * Caddy on-demand TLS "ask" endpoint: GET ?domain=print.shop.ae -> 200 if the domain belongs to a live tenant.
 * Prevents anyone pointing random domains at us and exhausting certificate rate limits.
 */
export async function GET(req: Request) {
  const domain = (new URL(req.url).searchParams.get("domain") ?? "").toLowerCase().trim();
  if (!domain) return new NextResponse("missing domain", { status: 400 });
  const root = (process.env.ROOT_DOMAIN ?? "").toLowerCase().split(":")[0];
  if (root && (domain === root || domain.endsWith(`.${root}`))) return new NextResponse("ok");
  const t = await db.query.tenants.findFirst({
    where: and(eq(schema.tenants.customDomain, domain), notInArray(schema.tenants.status, ["cancelled"])),
    columns: { id: true },
  });
  return t ? new NextResponse("ok") : new NextResponse("unknown domain", { status: 404 });
}
