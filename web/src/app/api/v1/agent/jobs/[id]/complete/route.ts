import { NextResponse } from "next/server";
import { z } from "zod";
import { completeJob } from "@/server/walk-in/queue";
import { isResponse, withAgent } from "../../../_lib";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const Body = z.object({ status: z.enum(["printed", "failed", "needs_manual"]), error: z.string().max(500).optional() });

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await withAgent(req);
  if (isResponse(a)) return a;
  const id = (await ctx.params).id;
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  const job = await completeJob(a.tenant.id, id, a.agent.id, parsed.data);
  if (!job) return NextResponse.json({ error: "Job not found or not claimed by this agent" }, { status: 404 });
  return NextResponse.json({ job: { id: job.id, status: job.status } });
}
