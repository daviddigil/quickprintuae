import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { RESERVED_SLUGS, SLUG_RE } from "../schema";

export async function GET(req: Request) {
  const slug = (new URL(req.url).searchParams.get("slug") ?? "").trim().toLowerCase();
  if (!SLUG_RE.test(slug)) return NextResponse.json({ available: false, reason: "3–32 chars: lowercase letters, numbers, dashes" });
  if (RESERVED_SLUGS.has(slug)) return NextResponse.json({ available: false, reason: "This name is reserved" });
  const t = await db.query.tenants.findFirst({ where: eq(schema.tenants.slug, slug), columns: { id: true } });
  return NextResponse.json({ available: !t, reason: t ? "Already taken" : undefined });
}
