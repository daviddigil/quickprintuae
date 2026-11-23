import "server-only";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { PrintAgent, Tenant } from "@/db/schema";
import { authenticateAgent } from "@/server/walk-in/agents";
import { assertFeature, FeatureLockedError } from "@/server/billing";

const hits = new Map<string, number[]>();
const LIMIT = 120; // requests / minute / key

export type AgentCtx = { agent: PrintAgent; tenant: Tenant };

/**
 * Authenticates the agent key, applies a per-key rate limit and checks the shop is active and on a plan with
 * walk_in_queue. The tenant ALWAYS comes from the key, never from the request.
 */
export async function withAgent(req: Request): Promise<AgentCtx | NextResponse> {
  const agent = await authenticateAgent(req);
  if (!agent) return NextResponse.json({ error: "Invalid or missing agent key" }, { status: 401 });
  const now = Date.now();
  const recent = (hits.get(agent.id) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= LIMIT) return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { "retry-after": "10" } });
  hits.set(agent.id, [...recent, now]);
  const tenant = await db.query.tenants.findFirst({ where: eq(schema.tenants.id, agent.tenantId) });
  if (!tenant || tenant.status === "suspended" || tenant.status === "cancelled") return NextResponse.json({ error: "Shop unavailable" }, { status: 403 });
  try { await assertFeature(tenant, "walk_in_queue"); }
  catch (e) { if (e instanceof FeatureLockedError) return NextResponse.json({ error: e.message }, { status: 403 }); throw e; }
  return { agent, tenant };
}
export const isResponse = (x: AgentCtx | NextResponse): x is NextResponse => x instanceof NextResponse;
