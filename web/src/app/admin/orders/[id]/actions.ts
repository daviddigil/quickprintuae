"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireStaff } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { NEXT_STATUSES, setOrderStatus } from "@/server/orders";

/** The shop declines / cancels a job under the Acceptable Use Policy. A written reason is required and stored on the order. */
export async function declineOrder(fd: FormData) {
  const { tenant, user } = await requireStaff();
  const id = (fd.get("orderId") ?? "").toString();
  const reason = (fd.get("reason") ?? "").toString().trim().slice(0, 1000);
  const to = (path: string, msg: string, err = false): never => redirect(`${path}?${err ? "error" : "ok"}=${encodeURIComponent(msg)}`);
  const path = `/admin/orders/${id}`;
  if (reason.length < 5) to(path, "Please give a reason (at least 5 characters)", true);
  const o = await db.query.orders.findFirst({ where: and(eq(schema.orders.id, id), eq(schema.orders.tenantId, tenant.id)) });
  if (!o) to("/admin/orders", "Order not found", true);
  else if (!NEXT_STATUSES[o.status].includes("cancelled")) to(path, `A ${o.status.replace("_", " ")} order can no longer be declined`, true);
  else {
    await db.update(schema.orders).set({ declinedReason: reason, updatedAt: new Date() }).where(eq(schema.orders.id, o.id));
    await setOrderStatus(o.id, "cancelled", `Declined under the Acceptable Use Policy: ${reason}`, user.id);
    await audit("order.declined", { orderId: o.id, number: o.number, from: o.status, reason }, tenant.id);
    revalidatePath(path);
    to(path, "Order declined and cancelled");
  }
}
