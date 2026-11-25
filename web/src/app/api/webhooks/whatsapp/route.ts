import { after, NextResponse } from "next/server";
import { whatsappEnabled } from "@/lib/whatsapp-flag";
import { parseWebhook } from "@/server/whatsapp/parse";
import { processEvents } from "@/server/whatsapp/process";
import { authenticateWebhook, touchWebhook, verifyTokenValid } from "@/server/whatsapp/webhook-auth";

export const runtime = "nodejs";

/** Meta webhook verification handshake. */
export async function GET(req: Request) {
  if (!whatsappEnabled()) return new NextResponse("Not found", { status: 404 });
  const u = new URL(req.url).searchParams;
  if (u.get("hub.mode") === "subscribe" && (await verifyTokenValid(u.get("hub.verify_token")))) {
    return new NextResponse(u.get("hub.challenge") ?? "", { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

export async function POST(req: Request) {
  if (!whatsappEnabled()) return NextResponse.json({ error: "WhatsApp is switched off on this platform" }, { status: 503 });
  const raw = await req.text(); // the signature is over the RAW bytes
  const auth = await authenticateWebhook(raw, req.headers.get("x-hub-signature-256"));
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  let payload: unknown;
  try { payload = JSON.parse(raw); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }
  const events = parseWebhook(payload);
  await touchWebhook(raw);
  // Ack within Meta's timeout; do the AI work after the response is sent
  after(() => processEvents(events));
  return NextResponse.json({ received: events.length });
}
