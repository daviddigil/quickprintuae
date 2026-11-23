import "server-only";
import { createHash, randomBytes } from "crypto";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";

const hashKey = (k: string) => createHash("sha256").update(k).digest("hex");

/** Creates an agent and returns the raw key ONCE (only its hash is stored). */
export async function createAgent(tenantId: string, name: string) {
  const key = `qpa_${randomBytes(24).toString("base64url")}`;
  const [agent] = await db.insert(schema.printAgents).values({ tenantId, name, apiKeyHash: hashKey(key), apiKeyPrefix: key.slice(0, 8) }).returning();
  return { agent, key };
}

/** Bearer-key auth for agent routes. Returns the agent (and thereby the tenant) or null. */
export async function authenticateAgent(req: Request) {
  const m = /^Bearer\s+(qpa_[A-Za-z0-9_-]{20,})$/.exec(req.headers.get("authorization") ?? "");
  if (!m) return null;
  const agent = await db.query.printAgents.findFirst({ where: and(eq(schema.printAgents.apiKeyHash, hashKey(m[1])), eq(schema.printAgents.active, true)) });
  if (!agent) return null;
  await db.update(schema.printAgents).set({ lastSeenAt: new Date() }).where(eq(schema.printAgents.id, agent.id));
  return agent;
}

/** An agent counts as online if it checked in within the last 2 minutes. */
export const agentOnline = (a: { lastSeenAt: Date | null }) => !!a.lastSeenAt && Date.now() - a.lastSeenAt.getTime() < 120_000;
