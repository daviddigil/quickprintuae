import "server-only";
import { and, inArray, isNull, lt, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { deleteFile } from "@/server/storage";
import { withoutHeld } from "@/server/retention";

export const ORPHAN_HOURS = 24;

/**
 * Ids of files that are referenced by something and must never be purged as "orphans":
 *  - order_items.file_ids (the order line's artwork / documents)
 *  - quote_requests.file_ids (quotes keep their files with files.order_id = null forever)
 *  - print_jobs.file_id (walk-in and agent jobs)
 * Seller verification documents are not rows in `files` (they live under seller_verifications.document_key), but their
 * storage keys are also excluded below as a belt-and-braces guard.
 */
export async function referencedFileIds(candidateIds: string[]): Promise<Set<string>> {
  if (!candidateIds.length) return new Set();
  const arr = sql`ARRAY[${sql.join(candidateIds.map((i) => sql`${i}::text`), sql`, `)}]`;
  const rows = await db.execute(sql`
    SELECT file_id::text AS id FROM print_jobs WHERE file_id::text = ANY(${arr})
    UNION SELECT e AS id FROM order_items, jsonb_array_elements_text(file_ids) AS e WHERE e = ANY(${arr})
    UNION SELECT e AS id FROM quote_requests, jsonb_array_elements_text(file_ids) AS e WHERE e = ANY(${arr})
  `);
  return new Set((rows as unknown as { id: string }[]).map((r) => r.id));
}

/**
 * Deletes uploads that were never attached to anything and are older than `hours` (default 24): removes the bytes from storage
 * and soft-deletes the row. SAFE by construction: files attached to an order (files.order_id), listed in order_items.file_ids,
 * quote_requests.file_ids or print_jobs, and seller verification documents are never touched. Used by both hourly crons.
 */
export async function purgeOrphanUploads(opts: { hours?: number; now?: Date; limit?: number } = {}): Promise<number> {
  const cutoff = new Date((opts.now ?? new Date()).getTime() - (opts.hours ?? ORPHAN_HOURS) * 3600_000);
  const candidates = await db.select().from(schema.files)
    .where(and(isNull(schema.files.orderId), isNull(schema.files.deletedAt), lt(schema.files.createdAt, cutoff)))
    .limit(opts.limit ?? 500);
  if (!candidates.length) return 0;
  const keep = await referencedFileIds(candidates.map((f) => f.id));
  const docKeys = new Set((await db.select({ k: schema.sellerVerifications.documentKey }).from(schema.sellerVerifications)).map((r) => r.k).filter(Boolean) as string[]);
  // legal hold: never purge files of a held order or a held shop
  const doomed = await withoutHeld(candidates.filter((f) => !keep.has(f.id) && !docKeys.has(f.storageKey)));
  for (const f of doomed) await deleteFile(f.storageKey);
  if (doomed.length) await db.update(schema.files).set({ deletedAt: new Date() }).where(inArray(schema.files.id, doomed.map((f) => f.id)));
  return doomed.length;
}
