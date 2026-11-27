import "server-only";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { REPORT_CATEGORIES } from "@/lib/compliance";

export const ReportInput = z.object({
  category: z.enum(REPORT_CATEGORIES),
  description: z.string().trim().min(10, "Please describe the problem (at least 10 characters)").max(3000),
  url: z.string().trim().max(500).optional().or(z.literal("")),
  orderNumber: z.string().trim().max(60).optional().or(z.literal("")),
  reporterName: z.string().trim().max(120).optional().or(z.literal("")),
  reporterEmail: z.string().trim().email().max(200).optional().or(z.literal("")),
  /** honeypot: real users never fill it */
  website: z.string().optional(),
  turnstileToken: z.string().optional(),
});

export const REPORT_TRANSITIONS: Record<string, string[]> = {
  open: ["reviewing", "actioned", "rejected"],
  reviewing: ["actioned", "rejected", "open"],
  actioned: ["reviewing"],
  rejected: ["reviewing"],
};
export const canMoveReport = (from: string, to: string) => from === to || (REPORT_TRANSITIONS[from] ?? []).includes(to);

export async function createReport(input: z.infer<typeof ReportInput>) {
  let tenantId: string | null = null, orderId: string | null = null;
  const num = input.orderNumber?.trim();
  if (num) {
    // order numbers are only unique per shop; link only when the match is unambiguous
    const rows = await db.select({ id: schema.orders.id, tenantId: schema.orders.tenantId }).from(schema.orders).where(eq(schema.orders.number, num)).limit(2);
    if (rows.length === 1) { orderId = rows[0].id; tenantId = rows[0].tenantId; }
  }
  const [r] = await db.insert(schema.contentReports).values({
    tenantId, orderId, category: input.category, description: input.description, url: input.url || null,
    reporterName: input.reporterName || null, reporterEmail: input.reporterEmail ? input.reporterEmail.toLowerCase() : null,
  }).returning();
  return r;
}

export async function updateReport(id: string, patch: { status: string; resolution?: string | null }, handledBy: string) {
  const r = await db.query.contentReports.findFirst({ where: eq(schema.contentReports.id, id) });
  if (!r) return { ok: false as const, error: "Report not found" };
  if (!(REPORT_TRANSITIONS[r.status]?.includes(patch.status) || r.status === patch.status)) return { ok: false as const, error: `Cannot move from ${r.status} to ${patch.status}` };
  if ((patch.status === "actioned" || patch.status === "rejected") && !patch.resolution?.trim()) return { ok: false as const, error: "A resolution note is required" };
  const [row] = await db.update(schema.contentReports).set({ status: patch.status, resolution: patch.resolution?.trim().slice(0, 2000) || r.resolution, handledBy, handledAt: new Date() })
    .where(eq(schema.contentReports.id, id)).returning();
  return { ok: true as const, report: row, before: r };
}

/** Blocks the customer account behind a reported order (users.active=false). Customers only; never owners/staff/superadmin. */
export async function blockReportedCustomer(reportId: string) {
  const r = await db.query.contentReports.findFirst({ where: eq(schema.contentReports.id, reportId) });
  if (!r?.orderId) return { ok: false as const, error: "This report is not linked to an order" };
  const o = await db.query.orders.findFirst({ where: eq(schema.orders.id, r.orderId) });
  if (!o?.customerId) return { ok: false as const, error: "The order was placed as a guest: no account to block" };
  const [u] = await db.update(schema.users).set({ active: false }).where(and(eq(schema.users.id, o.customerId), eq(schema.users.role, "customer"))).returning();
  if (!u) return { ok: false as const, error: "Customer account not found" };
  return { ok: true as const, userId: u.id, tenantId: u.tenantId };
}
