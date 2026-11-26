/** Canonical-key helpers. No "server-only": the seed script (bundled by esbuild) calls backfillTrustKeys on every container start. */
import { eq } from "drizzle-orm";
import type { DB } from "@/db/client";
import * as schema from "@/db/schema";
import { canonicalEmail, canonicalPhone } from "@/lib/trust/normalise";

export const ownerKeys = (email: string, phone?: string | null) => ({
  emailCanonical: canonicalEmail(email),
  phoneCanonical: phone ? canonicalPhone(phone) : null,
});

/**
 * Idempotent: gives every owner account its exact canonical email/phone key (the migration only lower-cased the email).
 * Rows whose key would collide with another owner are left alone (logged), so old duplicates never block a deploy.
 */
export async function backfillTrustKeys(db: DB): Promise<{ updated: number; conflicts: number }> {
  const owners = await db.select().from(schema.users).where(eq(schema.users.role, "owner"));
  const taken = { email: new Map<string, string>(), phone: new Map<string, string>() };
  for (const o of owners) {
    if (o.emailCanonical) taken.email.set(o.emailCanonical, o.id);
    if (o.phoneCanonical) taken.phone.set(o.phoneCanonical, o.id);
  }
  let updated = 0, conflicts = 0;
  for (const o of owners) {
    const want = ownerKeys(o.email, o.phone);
    const emailChanged = o.emailCanonical !== want.emailCanonical;
    const phoneChanged = (o.phoneCanonical ?? null) !== want.phoneCanonical;
    if (!emailChanged && !phoneChanged) continue;
    const patch: Partial<typeof schema.users.$inferInsert> = {};
    if (emailChanged) {
      const holder = taken.email.get(want.emailCanonical);
      if (holder && holder !== o.id) { conflicts++; console.warn(`[trust] owner ${o.id}: canonical email collides with another owner, left unchanged`); }
      else { patch.emailCanonical = want.emailCanonical; taken.email.set(want.emailCanonical, o.id); }
    }
    if (phoneChanged) {
      const holder = want.phoneCanonical ? taken.phone.get(want.phoneCanonical) : undefined;
      if (holder && holder !== o.id) { conflicts++; console.warn(`[trust] owner ${o.id}: canonical phone collides with another owner, left unchanged`); }
      else { patch.phoneCanonical = want.phoneCanonical; if (want.phoneCanonical) taken.phone.set(want.phoneCanonical, o.id); }
    }
    if (Object.keys(patch).length) {
      try { await db.update(schema.users).set(patch).where(eq(schema.users.id, o.id)); updated++; }
      catch (e) { conflicts++; console.warn(`[trust] owner ${o.id}: backfill skipped (${(e as Error).message})`); }
    }
  }
  return { updated, conflicts };
}
