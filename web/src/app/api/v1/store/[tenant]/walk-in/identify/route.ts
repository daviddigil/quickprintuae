import { NextResponse } from "next/server";
import { z } from "zod";
import { normalizePhone } from "@/lib/phone";
import { knownFirstName } from "@/server/walk-in/customers";
import { gateRequest, limited } from "../_gate";

export const runtime = "nodejs";
const Body = z.object({ phone: z.string().trim().min(3).max(30) });

/** Step 1: normalise the number and greet a returning customer by FIRST NAME only. */
export async function POST(req: Request, { params }: { params: Promise<{ tenant: string }> }) {
  const g = await gateRequest((await params).tenant);
  if ("res" in g) return g.res;
  const body = Body.safeParse(await req.json().catch(() => null));
  const phone = body.success ? normalizePhone(body.data.phone) : null;
  if (!phone) return NextResponse.json({ error: "Please enter a valid mobile number, e.g. 050 123 4567." }, { status: 400 });
  const rl = limited(req, "wi-identify", 20, 600_000, { key: `phone:${phone}`, limit: 6 });
  if (rl) return rl;
  return NextResponse.json({ phone, firstName: await knownFirstName(g.tenant.id, phone) });
}
