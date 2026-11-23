import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { isResponse, withAgent } from "../_lib";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const Body = z.object({ printers: z.array(z.string().max(200)).max(50).default([]) });

export async function POST(req: Request) {
  const ctx = await withAgent(req);
  if (isResponse(ctx)) return ctx;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  await db.update(schema.printAgents).set({ printers: parsed.data.printers, lastSeenAt: new Date() }).where(eq(schema.printAgents.id, ctx.agent.id));
  return NextResponse.json({ ok: true, shop: { name: ctx.tenant.name }, serverTime: new Date().toISOString() });
}
