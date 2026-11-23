import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getFile } from "@/server/storage";
import { isResponse, withAgent } from "../../../_lib";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Streams the (decrypted) file — only for a job of the agent's own shop that THIS agent has claimed and is printing. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await withAgent(req);
  if (isResponse(a)) return a;
  const id = (await ctx.params).id;
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const job = await db.query.printJobs.findFirst({ where: and(eq(schema.printJobs.id, id), eq(schema.printJobs.tenantId, a.tenant.id)) });
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (job.status !== "printing" || job.claimedByAgentId !== a.agent.id) return NextResponse.json({ error: "Job is not claimed by this agent" }, { status: 403 });
  const file = await db.query.files.findFirst({ where: and(eq(schema.files.id, job.fileId), eq(schema.files.tenantId, a.tenant.id)) });
  if (!file || file.deletedAt) return NextResponse.json({ error: "File no longer available" }, { status: 410 });
  const buf = await getFile(file.storageKey, file.confidential).catch(() => null);
  if (!buf) return NextResponse.json({ error: "File no longer available" }, { status: 410 });
  await db.insert(schema.auditLogs).values({ tenantId: a.tenant.id, action: "agent.file_download", meta: { jobId: job.id, agentId: a.agent.id } });
  return new Response(new Uint8Array(buf), {
    headers: {
      "content-type": file.mime, "content-length": String(buf.length),
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(job.filename)}`,
      "cache-control": "no-store", "x-content-type-options": "nosniff",
    },
  });
}
