/** DB-backed. Run: npm test */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { clearMetaPlatformConfig, describeMetaConfig, getMetaPlatformConfig, readiness, saveMetaPlatformConfig, META_PROVIDER } from "./platform-config";

const KEYS = ["META_APP_ID", "META_APP_SECRET", "META_VERIFY_TOKEN", "META_EMBEDDED_SIGNUP_CONFIG_ID", "META_GRAPH_VERSION", "META_BUSINESS_ID"] as const;
const saved: Record<string, string | undefined> = {};
before(async () => { for (const k of KEYS) { saved[k] = process.env[k]; delete process.env[k]; } await clearMetaPlatformConfig(); });
after(async () => { await clearMetaPlatformConfig(); for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });

test("readiness: needs app id + secret + verify token; Embedded Signup also needs the configuration id", () => {
  assert.deepEqual(readiness({}), { platformReady: false, embeddedSignupReady: false });
  assert.deepEqual(readiness({ appId: "1", appSecret: "s", verifyToken: "t" }), { platformReady: true, embeddedSignupReady: false });
  assert.deepEqual(readiness({ appId: "1", appSecret: "s", verifyToken: "t", signupConfigId: "9" }), { platformReady: true, embeddedSignupReady: true });
});

test("nothing configured => not ready (the owner button shows 'activation pending')", async () => {
  const c = await getMetaPlatformConfig({ fresh: true });
  assert.equal(readiness(c).embeddedSignupReady, false);
  assert.deepEqual(Object.values(c.sources), ["none", "none", "none", "none"]);
});

test("env variables remain a fallback", async () => {
  process.env.META_APP_ID = "1000001"; process.env.META_APP_SECRET = "env-secret-123456"; process.env.META_VERIFY_TOKEN = "env-verify-123456"; process.env.META_EMBEDDED_SIGNUP_CONFIG_ID = "2000002";
  const c = await getMetaPlatformConfig({ fresh: true });
  assert.equal(c.appSecret, "env-secret-123456"); assert.equal(readiness(c).embeddedSignupReady, true);
  assert.deepEqual(Object.values(c.sources), ["env", "env", "env", "env"]);
});

test("DB values win over env, per field; a save takes effect immediately (cache invalidated)", async () => {
  await getMetaPlatformConfig(); // warm the cache with env values
  await saveMetaPlatformConfig({ appId: "5550001", appSecret: "db-secret-abcdef123456", verifyToken: "db-verify-abcdef" });
  const c = await getMetaPlatformConfig(); // NOT fresh: must already see the save
  assert.equal(c.appId, "5550001"); assert.equal(c.appSecret, "db-secret-abcdef123456"); assert.equal(c.verifyToken, "db-verify-abcdef");
  assert.equal(c.signupConfigId, "2000002", "field not saved in the DB still falls back to env");
  assert.deepEqual([c.sources.appId, c.sources.appSecret, c.sources.verifyToken, c.sources.signupConfigId], ["db", "db", "db", "env"]);
});

test("secret + verify token are encrypted at rest and never returned by describeMetaConfig", async () => {
  const [row] = await db.select().from(schema.platformGateways).where(eq(schema.platformGateways.provider, META_PROVIDER));
  assert.ok(row.apiKeyEnc!.startsWith("v1:") && !row.apiKeyEnc!.includes("db-secret"), "app secret encrypted");
  assert.ok(row.webhookSecretEnc!.startsWith("v1:") && !row.webhookSecretEnc!.includes("db-verify"), "verify token encrypted");
  assert.ok(!JSON.stringify(row.config).includes("db-secret"), "config jsonb holds no secret");
  const d = await describeMetaConfig();
  const json = JSON.stringify(d);
  assert.ok(!json.includes("db-secret-abcdef123456") && !json.includes("db-verify-abcdef"), "no secret in the public view");
  assert.equal(d.appSecretMask, "••••3456"); assert.equal(d.hasAppSecret, true);
});

test("omitting the secret keeps the stored one; clearing a plain field removes it", async () => {
  await saveMetaPlatformConfig({ configId: "7770007" });
  let c = await getMetaPlatformConfig();
  assert.equal(c.appSecret, "db-secret-abcdef123456", "secret untouched"); assert.equal(c.signupConfigId, "7770007");
  await saveMetaPlatformConfig({ configId: "" });
  c = await getMetaPlatformConfig();
  assert.equal(c.signupConfigId, "2000002", "cleared DB value -> env fallback again");
});

test("removing the saved credentials falls back to env; with env removed too it is not ready", async () => {
  await clearMetaPlatformConfig();
  let c = await getMetaPlatformConfig();
  assert.equal(c.appId, "1000001");
  for (const k of KEYS) delete process.env[k];
  c = await getMetaPlatformConfig({ fresh: true });
  assert.equal(readiness(c).embeddedSignupReady, false);
});
