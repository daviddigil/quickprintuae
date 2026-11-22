import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { guard } from "@/server/whatsapp/guard";

export async function GET() {
  const g = await guard();
  if (!g.ok) return g.res;
  const rows = await db.select().from(schema.whatsappConversations).where(eq(schema.whatsappConversations.tenantId, g.tenant.id)).orderBy(desc(schema.whatsappConversations.lastMessageAt)).limit(50);
  return NextResponse.json({ conversations: rows });
}
