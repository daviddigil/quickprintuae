import { NextResponse } from "next/server";
import { outbox, emailProvider } from "@/server/email";

export const dynamic = "force-dynamic";

/** TEST ONLY: returns captured emails. 404 unless EMAIL_TEST_OUTBOX=1 and EMAIL_PROVIDER=console. Never enable in production. */
export async function GET(req: Request) {
  if (process.env.EMAIL_TEST_OUTBOX !== "1" || emailProvider() !== "console") return new NextResponse("Not found", { status: 404 });
  const to = new URL(req.url).searchParams.get("to")?.toLowerCase();
  return NextResponse.json({ messages: outbox().filter((m) => !to || m.to.toLowerCase() === to).reverse() });
}
