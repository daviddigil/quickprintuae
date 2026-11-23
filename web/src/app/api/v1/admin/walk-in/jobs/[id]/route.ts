import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { hasFeature } from "@/server/billing";
import { bumpJob, cancelJob, markPrintedManually, reprintJob } from "@/server/walk-in/queue";

const Body = z.object({ action: z.enum(["bump", "cancel", "reprint", "mark_printed"]) });
const RUN = { bump: bumpJob, cancel: cancelJob, reprint: reprintJob, mark_printed: markPrintedManually } as const;
const WHY = {
  bump: "Only jobs waiting in the queue can be moved to the top.", cancel: "This job can no longer be cancelled.",
  reprint: "Only finished or failed jobs can be reprinted.", mark_printed: "This job can't be marked as printed right now.",
};

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const cu = await getCurrentUser();
  if (!cu || !cu.session.tid || !["owner", "staff"].includes(cu.user.role)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const tid = cu.session.tid; // ONLY the session's shop is ever used
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  const tenant = await db.query.tenants.findFirst({ where: eq(schema.tenants.id, tid) });
  if (!tenant || !(await hasFeature(tenant, "walk_in_queue"))) return NextResponse.json({ error: "Walk-in queue isn't included in your plan" }, { status: 403 });
  const job = await db.query.printJobs.findFirst({ where: and(eq(schema.printJobs.id, id), eq(schema.printJobs.tenantId, tid)) });
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { action } = parsed.data;
  const result = await RUN[action](tid, id);
  if (!result) return NextResponse.json({ error: WHY[action] }, { status: 409 });
  await audit(`walkin.job.${action}`, { jobId: id, ticketNo: job.ticketNo, from: job.status }, tid);
  return NextResponse.json({ ok: true, status: result.status });
}
