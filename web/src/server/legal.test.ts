/** DB-backed. Run via `npm test`. */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { createDb } from "@/db/client";
import { provisionTenant } from "@/server/provision";
import { hashIp, listLegalAcceptances, recordLegalAcceptance } from "./legal";
import { LEGAL_VERSION, SIGNUP_ACCEPT_KEYS, needsReaccept } from "@/lib/legal";
import { SignupBody, isLegalAccepted } from "@/app/api/v1/signup/schema";

const suffix = Date.now().toString(36);
let tid = "";
after(async () => { if (tid) await db.delete(schema.tenants).where(eq(schema.tenants.id, tid)); });

const body = { shopName: "Shop", slug: "shop-x", ownerName: "Owner", email: "o@t.ae", phone: "0501234567", password: "pw123456", emirate: "Dubai" };

test("signup body: only an explicit yes counts as acceptance", () => {
  assert.equal(isLegalAccepted(SignupBody.parse({ ...body, acceptLegal: true }).acceptLegal), true);
  assert.equal(isLegalAccepted(SignupBody.parse({ ...body, acceptLegal: "on" }).acceptLegal), true);
  for (const v of [undefined, false, "false", "", 0, null]) assert.equal(isLegalAccepted(SignupBody.parse({ ...body, acceptLegal: v }).acceptLegal), false, String(v));
});

test("acceptance row stores version, documents, hashed ip and user agent", async () => {
  const { tenant, owner } = await provisionTenant(createDb().db, { shopName: `L ${suffix}`, slug: `lg${suffix}`, ownerName: "O", ownerEmail: `lg${suffix}@t.ae`, ownerPassword: "pw123456", incomplete: true });
  tid = tenant.id;
  assert.equal((await listLegalAcceptances(tenant.id)).length, 0);
  assert.equal(needsReaccept((await listLegalAcceptances(tenant.id))[0]), true);
  await recordLegalAcceptance({ tenantId: tenant.id, userId: owner.id, ip: "203.0.113.9", userAgent: "UA/1.0" });
  const [row] = await listLegalAcceptances(tenant.id);
  assert.equal(row.version, LEGAL_VERSION);
  assert.deepEqual(row.documents, [...SIGNUP_ACCEPT_KEYS]);
  assert.equal(row.userId, owner.id);
  assert.equal(row.userAgent, "UA/1.0");
  assert.equal(row.ipHash, hashIp("203.0.113.9"));
  assert.ok(row.ipHash && !row.ipHash.includes("203"), "ip is hashed");
  assert.equal(needsReaccept(row), false);
});
