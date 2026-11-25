import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { rateLimit } from "@/lib/rate-limit";
import { guard } from "@/server/whatsapp/guard";
import { runAgent } from "@/server/whatsapp/agent";
import { memoryCartStore, repriceCart } from "@/server/whatsapp/cart";
import { handleButton } from "@/server/whatsapp/buttons";
import { CONFIRM_BUTTONS } from "@/server/whatsapp/cart-math";

const Body = z.object({
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(1500) })).min(1).max(20),
  /** cart state kept by the browser between turns — re-priced server-side on every request, never trusted */
  cart: z.array(z.unknown()).max(10).optional(),
  buttonId: z.string().max(64).optional(),
});

/** Owner tries the AI before connecting a number: same agent and shop data, NOTHING is sent to WhatsApp, nothing is stored. */
export async function POST(req: Request) {
  const g = await guard();
  if (!g.ok) return g.res;
  const rl = rateLimit(`wa-test:${g.tenant.id}`, 30, 10 * 60_000);
  if (!rl.ok) return NextResponse.json({ error: `Too many test messages. Try again in ${rl.retryAfterSec}s.` }, { status: 429 });
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid test chat request" }, { status: 400 });
  const { messages, buttonId } = parsed.data;
  if (messages[messages.length - 1].role !== "user") return NextResponse.json({ error: "The last message must be from the customer" }, { status: 400 });

  const cart = memoryCartStore(await repriceCart(g.tenant, parsed.data.cart ?? []));
  const account = await db.query.whatsappAccounts.findFirst({ where: eq(schema.whatsappAccounts.tenantId, g.tenant.id) });
  const result = (buttonId ? await handleButton(g.tenant, cart, buttonId) : null) ?? await runAgent(g.tenant, messages, { cart, greeting: account?.greeting ?? "", firstMessage: messages.length <= 1 });
  return NextResponse.json({ reply: result.reply, engine: result.engine, handoff: result.handoff, needsHuman: result.needsHuman ?? null, links: result.links, cart: cart.items, buttons: result.offerButtons && !result.handoff ? CONFIRM_BUTTONS : [] });
}
