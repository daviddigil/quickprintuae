import "server-only";
import { createHmac } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { env } from "@/lib/env";
import { LEGAL_VERSION, SIGNUP_ACCEPT_KEYS, type LegalKey } from "@/lib/legal";

type Db = typeof db;

/** HMAC of the IP with the app secret: lets us show "same network" evidence without keeping the address itself. */
export const hashIp = (ip: string | null | undefined) => (ip ? createHmac("sha256", env.authSecret).update(`legal-ip:${ip}`).digest("hex").slice(0, 40) : null);

/** Stores one acceptance row (append-only). `database` can be a transaction. */
export async function recordLegalAcceptance(
  input: { tenantId: string; userId?: string | null; ip?: string | null; userAgent?: string | null; documents?: readonly LegalKey[]; version?: string },
  database: Db = db,
) {
  const [row] = await database.insert(schema.legalAcceptances).values({
    tenantId: input.tenantId, userId: input.userId ?? null,
    documents: [...(input.documents ?? SIGNUP_ACCEPT_KEYS)], version: input.version ?? LEGAL_VERSION,
    ipHash: hashIp(input.ip), userAgent: input.userAgent ? input.userAgent.slice(0, 300) : null,
  }).returning();
  return row;
}

export async function listLegalAcceptances(tenantId: string, limit = 5) {
  return db.select().from(schema.legalAcceptances).where(eq(schema.legalAcceptances.tenantId, tenantId)).orderBy(desc(schema.legalAcceptances.acceptedAt)).limit(limit);
}
