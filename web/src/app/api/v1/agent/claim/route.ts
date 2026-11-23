import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { claimNext } from "@/server/walk-in/queue";
import { isResponse, withAgent } from "../_lib";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const Body = z.object({ printer: z.string().max(200).optional() });

export async function POST(req: Request) {
  const ctx = await withAgent(req);
  if (isResponse(ctx)) return ctx;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  const job = await claimNext(ctx.tenant.id, ctx.agent.id, parsed.data.printer);
  if (!job) return NextResponse.json({ job: null });
  const file = await db.query.files.findFirst({ where: (f, { eq }) => eq(f.id, job.fileId) });
  return NextResponse.json({
    job: { id: job.id, filename: job.filename, mime: file?.mime ?? "application/octet-stream", copies: job.copies, pages: job.pages, options: job.options, ticketNo: job.ticketNo, attempt: job.attempts },
  });
}
