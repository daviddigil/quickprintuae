import { NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { guard } from "@/server/whatsapp/guard";

async function load(tenantId: string, id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  return (await db.query.whatsappConversations.findFirst({ where: and(eq(schema.whatsappConversations.id, id), eq(schema.whatsappConversations.tenantId, tenantId)) })) ?? null;
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard();
  if (!g.ok) return g.res;
  const conv = await load(g.tenant.id, (await ctx.params).id);
  if (!conv) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const messages = await db.select().from(schema.whatsappMessages).where(eq(schema.whatsappMessages.conversationId, conv.id)).orderBy(asc(schema.whatsappMessages.createdAt)).limit(200);
  return NextResponse.json({ conversation: conv, messages: messages.map((m) => ({ id: m.id, direction: m.direction, source: m.source, type: m.type, body: m.body, status: m.status, createdAt: m.createdAt })) });
}

/** Resume the AI after a human handoff. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard();
  if (!g.ok) return g.res;
  const conv = await load(g.tenant.id, (await ctx.params).id);
  if (!conv) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const p = z.object({ resumeAi: z.literal(true) }).safeParse(await req.json().catch(() => ({})));
  if (!p.success) return NextResponse.json({ error: "Invalid" }, { status: 400 });
  await db.update(schema.whatsappConversations).set({ aiPausedUntil: null }).where(eq(schema.whatsappConversations.id, conv.id));
  return NextResponse.json({ ok: true });
}
