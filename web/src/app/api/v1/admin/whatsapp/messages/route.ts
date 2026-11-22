import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { guard } from "@/server/whatsapp/guard";
import { sendText } from "@/server/whatsapp/graph";
import { pauseUntil } from "@/server/whatsapp/process";

const Body = z.object({ conversationId: z.string().uuid(), text: z.string().trim().min(1).max(4000) });

/** Manual reply from the admin panel. Also pauses the AI for the handoff window. */
export async function POST(req: Request) {
  const g = await guard();
  if (!g.ok) return g.res;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid message" }, { status: 400 });
  const conv = await db.query.whatsappConversations.findFirst({ where: and(eq(schema.whatsappConversations.id, parsed.data.conversationId), eq(schema.whatsappConversations.tenantId, g.tenant.id)) });
  const account = conv && (await db.query.whatsappAccounts.findFirst({ where: eq(schema.whatsappAccounts.id, conv.accountId) }));
  if (!conv || !account) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    await sendText(account, conv, parsed.data.text, "admin");
    await db.update(schema.whatsappConversations).set({ aiPausedUntil: pauseUntil(account) }).where(eq(schema.whatsappConversations.id, conv.id));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 422 });
  }
}
