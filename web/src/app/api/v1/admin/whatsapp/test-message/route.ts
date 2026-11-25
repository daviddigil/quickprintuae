import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { audit } from "@/lib/audit";
import { normalizePhone } from "@/lib/phone";
import { rateLimit } from "@/lib/rate-limit";
import { guard } from "@/server/whatsapp/guard";
import { GraphError, sendTemplateTest } from "@/server/whatsapp/graph";

/** After connecting: send WhatsApp's `hello_world` template to the owner's PERSONAL number so they can see it work. */
export async function POST(req: Request) {
  const g = await guard({ ownerOnly: true });
  if (!g.ok) return g.res;
  const rl = rateLimit(`wa-test-msg:${g.tenant.id}`, 5, 10 * 60_000);
  if (!rl.ok) return NextResponse.json({ error: `Too many test messages. Try again in ${rl.retryAfterSec}s.` }, { status: 429 });
  const parsed = z.object({ phone: z.string().min(6).max(30) }).safeParse(await req.json().catch(() => ({})));
  const to = parsed.success ? normalizePhone(parsed.data.phone) : null;
  if (!to) return NextResponse.json({ error: "Enter your personal WhatsApp number with the country code, e.g. +971 50 123 4567." }, { status: 400 });
  const account = await db.query.whatsappAccounts.findFirst({ where: eq(schema.whatsappAccounts.tenantId, g.tenant.id) });
  if (!account || account.status !== "connected") return NextResponse.json({ error: "Connect WhatsApp first." }, { status: 409 });
  if (to.replace(/\D/g, "") === (account.displayPhone ?? "").replace(/\D/g, "")) return NextResponse.json({ error: "That's your shop's own WhatsApp number. Use your personal number so you can see the message arrive." }, { status: 400 });
  try {
    const r = await sendTemplateTest(account, to.replace(/\D/g, ""));
    await audit("whatsapp.test_message", { to: `…${to.slice(-4)}` }, g.tenant.id);
    return NextResponse.json({ sent: true, id: r.id });
  } catch (e) {
    return NextResponse.json({ error: e instanceof GraphError ? e.message : "Could not send the test message." }, { status: 502 });
  }
}
