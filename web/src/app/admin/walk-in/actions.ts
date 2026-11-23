"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireStaff } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { assertFeature, FeatureLockedError } from "@/server/billing";
import { createAgent } from "@/server/walk-in/agents";
import { walkInSettings } from "@/server/walk-in/settings";

const back = (msg: string, err = false): never => redirect(`/admin/walk-in?${err ? "error" : "ok"}=${encodeURIComponent(msg)}`);

const Settings = z.object({
  enabled: z.boolean(),
  productId: z.string().uuid().nullable(),
  smallJobBoostPages: z.number().int().min(0).max(100),
  fileRetentionHours: z.number().int().min(1).max(168),
  maxFilesPerVisit: z.number().int().min(1).max(30),
});

export async function saveWalkInSettings(fd: FormData) {
  const { tenant, user } = await requireStaff({ ownerOnly: true });
  try { await assertFeature(tenant, "walk_in_queue"); } catch (e) { if (e instanceof FeatureLockedError) back(e.message, true); throw e; }
  const n = (k: string) => Number((fd.get(k) ?? "").toString());
  const parsed = Settings.safeParse({
    enabled: fd.get("enabled") === "on", productId: (fd.get("productId") ?? "").toString() || null,
    smallJobBoostPages: n("smallJobBoostPages"), fileRetentionHours: n("fileRetentionHours"), maxFilesPerVisit: n("maxFilesPerVisit"),
  });
  if (!parsed.success) return back(parsed.error.issues[0]?.message ?? "Invalid settings", true);
  const s = parsed.data;
  if (s.productId) {
    const p = await db.query.products.findFirst({ where: and(eq(schema.products.id, s.productId), eq(schema.products.tenantId, tenant.id), eq(schema.products.kind, "document"), eq(schema.products.active, true)) });
    if (!p) return back("Choose one of your active document products", true);
  }
  await db.update(schema.tenants).set({ settings: { ...tenant.settings, walkIn: { ...walkInSettings(tenant), ...s } } }).where(eq(schema.tenants.id, tenant.id));
  await audit("walkin.settings", { ...s, by: user.id }, tenant.id);
  revalidatePath("/admin/walk-in");
  back("Walk-in settings saved");
}

export type AgentFormState = { key?: string; name?: string; error?: string } | null;

/** Returns the raw key once in the action result (never in a URL). */
export async function createWalkInAgent(_prev: AgentFormState, fd: FormData): Promise<AgentFormState> {
  const { tenant, user } = await requireStaff({ ownerOnly: true });
  try { await assertFeature(tenant, "walk_in_queue"); } catch (e) { if (e instanceof FeatureLockedError) return { error: e.message }; throw e; }
  const name = (fd.get("name") ?? "").toString().trim();
  if (name.length < 2 || name.length > 60) return { error: "Give the agent a name, e.g. “Front counter PC”" };
  const count = await db.$count(schema.printAgents, and(eq(schema.printAgents.tenantId, tenant.id), eq(schema.printAgents.active, true)));
  if (count >= 10) return { error: "You can have up to 10 active agents. Revoke one first." };
  const { agent, key } = await createAgent(tenant.id, name);
  await audit("walkin.agent.create", { agentId: agent.id, name, by: user.id }, tenant.id);
  revalidatePath("/admin/walk-in");
  return { key, name };
}

export async function revokeWalkInAgent(fd: FormData) {
  const { tenant, user } = await requireStaff({ ownerOnly: true });
  const id = (fd.get("agentId") ?? "").toString();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return back("Agent not found", true);
  const [a] = await db.update(schema.printAgents).set({ active: false }).where(and(eq(schema.printAgents.id, id), eq(schema.printAgents.tenantId, tenant.id))).returning();
  if (!a) return back("Agent not found", true);
  await audit("walkin.agent.revoke", { agentId: id, name: a.name, by: user.id }, tenant.id);
  revalidatePath("/admin/walk-in");
  back(`Agent “${a.name}” revoked — its key no longer works`);
}
