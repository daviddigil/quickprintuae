import { sql } from "drizzle-orm";
import { db } from "@/db";
import { RETENTION_SCHEDULE } from "@/lib/compliance";

/**
 * Retention engine. The pure helpers use RETENTION_SCHEDULE (src/lib/compliance.ts; periods are placeholders a lawyer/accountant
 * must confirm). `heldFileIds` is the legal-hold guard used by every purge job: files of an order with orders.legal_hold, or of a
 * shop with tenants.legal_hold, are never deleted while the hold is on.
 */
export type RetentionKey = (typeof RETENTION_SCHEDULE)[number]["key"];

export function retentionRule(key: RetentionKey) {
  const r = RETENTION_SCHEDULE.find((x) => x.key === key);
  if (!r) throw new Error(`unknown retention key ${key}`);
  return r;
}

/** Records created before this instant are past retention. `null` = no automatic expiry (kept until erased on request). */
export function retentionCutoff(key: RetentionKey, now = new Date()): Date | null {
  const d = retentionRule(key).days;
  return d == null ? null : new Date(now.getTime() - d * 24 * 3600 * 1000);
}

export function isPastRetention(key: RetentionKey, createdAt: Date, now = new Date()): boolean {
  const cutoff = retentionCutoff(key, now);
  return !!cutoff && createdAt.getTime() < cutoff.getTime();
}

export interface HoldState { orderLegalHold?: boolean | null; tenantLegalHold?: boolean | null }
/** True when deletion/erasure of this record must be skipped. */
export const isLegalHeld = (h: HoldState): boolean => !!h.orderLegalHold || !!h.tenantLegalHold;

/**
 * Whether a personal-data erasure may remove a data class entirely. Tax records and consent evidence must be kept
 * for their period; only personal fields in them may be minimised.
 */
export function mustKeepRecord(key: RetentionKey): boolean {
  return key === "tax_records" || key === "consent_logs";
}

/** Ids (from `fileIds`) of files that are under a legal hold (their order or their shop is held). */
export async function heldFileIds(fileIds: string[]): Promise<Set<string>> {
  if (!fileIds.length) return new Set();
  const rows = await db.execute(sql`
    select f.id::text as id from files f
    join tenants t on t.id = f.tenant_id
    left join orders o on o.id = f.order_id
    where f.id in (${sql.join(fileIds.map((i) => sql`${i}::uuid`), sql`, `)}) and (t.legal_hold or coalesce(o.legal_hold, false))`);
  return new Set((rows as unknown as { id: string }[]).map((r) => r.id));
}

/** Drops the held files from a list of candidates. */
export async function withoutHeld<T extends { id: string }>(files: T[]): Promise<T[]> {
  if (!files.length) return files;
  const held = await heldFileIds(files.map((f) => f.id));
  return held.size ? files.filter((f) => !held.has(f.id)) : files;
}

