import { after, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { whatsappEnabled } from "@/lib/whatsapp-flag";
import { verifySignature } from "@/server/whatsapp/signature";
import { parseWebhook } from "@/server/whatsapp/parse";
import { processEvents } from "@/server/whatsapp/process";

export const runtime = "nodejs";

/** Meta webhook verification handshake. */
export async function GET(req: Request) {
  if (!whatsappEnabled()) return new NextResponse("Not found", { status: 404 });
  const u = new URL(req.url).searchParams;
  if (u.get("hub.mode") === "subscribe" && env.metaVerifyToken && u.get("hub.verify_token") === env.metaVerifyToken) {
    return new NextResponse(u.get("hub.challenge") ?? "", { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

export async function POST(req: Request) {
  if (!whatsappEnabled()) return NextResponse.json({ error: "WhatsApp ordering is coming soon" }, { status: 503 });
  const raw = await req.text(); // signature is over the RAW bytes
  if (!verifySignature(raw, req.headers.get("x-hub-signature-256"), env.metaAppSecret)) return new NextResponse("Invalid signature", { status: 401 });
  let payload: unknown;
  try { payload = JSON.parse(raw); } catch { return new NextResponse("Bad request", { status: 400 }); }
  const events = parseWebhook(payload);
  // Ack within Meta's timeout; do the AI work after the response is sent
  after(() => processEvents(events));
  return NextResponse.json({ received: events.length });
}
