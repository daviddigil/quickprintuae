import "server-only";
import { randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { decrypt, encrypt } from "@/lib/crypto";

/**
 * Platform-level Meta app ("Tech Provider") credentials for one-click Embedded Signup + the shared webhook.
 * DB-first (superadmin pastes them in /superadmin/settings/whatsapp — no redeploy), env fallback per field:
 * META_APP_ID, META_APP_SECRET, META_VERIFY_TOKEN, META_EMBEDDED_SIGNUP_CONFIG_ID, META_BUSINESS_ID, META_GRAPH_VERSION.
 * META_GRAPH_BASE is env-only (tests point it at a mock Graph server).
 *
 * Storage in platform_gateways (provider 'meta_whatsapp'): config = {appId, configId, businessId, graphVersion},
 * apiKeyEnc = encrypted APP SECRET, webhookSecretEnc = encrypted webhook VERIFY TOKEN.
 */
export const META_PROVIDER = "meta_whatsapp";

export interface MetaPlatformConfig {
  appId?: string;
  appSecret?: string;
  verifyToken?: string;
  signupConfigId?: string;
  businessId?: string;
  graphVersion: string;
  graphBase: string;
  /** where each field came from (for the superadmin page; never contains values) */
  sources: Record<"appId" | "appSecret" | "verifyToken" | "signupConfigId", "db" | "env" | "none">;
}

export interface MetaReadiness { platformReady: boolean; embeddedSignupReady: boolean }
export const readiness = (c: Pick<MetaPlatformConfig, "appId" | "appSecret" | "verifyToken" | "signupConfigId">): MetaReadiness => {
  const platformReady = !!(c.appId && c.appSecret && c.verifyToken);
  return { platformReady, embeddedSignupReady: platformReady && !!c.signupConfigId };
};

const TTL_MS = 10_000;
let cache: { at: number; value: MetaPlatformConfig } | null = null;
export const invalidateMetaPlatformConfig = () => { cache = null; };

async function readRow() { return db.query.platformGateways.findFirst({ where: eq(schema.platformGateways.provider, META_PROVIDER) }); }

export async function getMetaPlatformConfig(opts: { fresh?: boolean } = {}): Promise<MetaPlatformConfig> {
  if (!opts.fresh && cache && Date.now() - cache.at < TTL_MS) return cache.value;
  const e = process.env;
  const row = await readRow().catch(() => undefined); // a DB hiccup must not take WhatsApp down: fall back to env
  const c = row?.config ?? {};
  const pick = (fromDb: string | undefined, fromEnv: string | undefined) =>
    fromDb ? { v: fromDb, s: "db" as const } : fromEnv ? { v: fromEnv, s: "env" as const } : { v: undefined, s: "none" as const };
  const appId = pick(c.appId, e.META_APP_ID || undefined);
  const appSecret = pick(decrypt(row?.apiKeyEnc) || undefined, e.META_APP_SECRET || undefined);
  const verifyToken = pick(decrypt(row?.webhookSecretEnc) || undefined, e.META_VERIFY_TOKEN || undefined);
  const signupConfigId = pick(c.configId, e.META_EMBEDDED_SIGNUP_CONFIG_ID || undefined);
  const value: MetaPlatformConfig = {
    appId: appId.v, appSecret: appSecret.v, verifyToken: verifyToken.v, signupConfigId: signupConfigId.v,
    businessId: c.businessId || e.META_BUSINESS_ID || undefined,
    graphVersion: c.graphVersion || e.META_GRAPH_VERSION || "v21.0",
    graphBase: (e.META_GRAPH_BASE || "https://graph.facebook.com").replace(/\/$/, ""),
    sources: { appId: appId.s, appSecret: appSecret.s, verifyToken: verifyToken.s, signupConfigId: signupConfigId.s },
  };
  cache = { at: Date.now(), value };
  return value;
}

export const platformReady = async () => readiness(await getMetaPlatformConfig());

/** Public-safe view for the superadmin form: ids visible, secret/token only as presence + last 4. */
export async function describeMetaConfig() {
  const c = await getMetaPlatformConfig({ fresh: true });
  const row = await readRow();
  const mask = (s?: string) => (s ? `••••${s.slice(-4)}` : null);
  return {
    appId: c.appId ?? "", signupConfigId: c.signupConfigId ?? "", businessId: c.businessId ?? "", graphVersion: c.graphVersion,
    hasAppSecret: !!c.appSecret, appSecretMask: mask(c.appSecret), hasVerifyToken: !!c.verifyToken, verifyTokenMask: mask(c.verifyToken),
    sources: c.sources, ...readiness(c), graphHost: new URL(c.graphBase).host,
    lastTestAt: row?.lastTestAt ?? null, lastTestOk: row?.lastTestOk ?? null, lastTestMessage: row?.config?.lastTestMessage ?? null,
    updatedAt: row?.updatedAt ?? null,
  };
}

export interface MetaConfigInput {
  appId?: string; configId?: string; businessId?: string; graphVersion?: string;
  /** undefined = keep the stored secret; "" is rejected by the route (use a value to replace) */
  appSecret?: string; verifyToken?: string;
}

/** Upsert. Secrets are write-only: omitted values keep what is stored. */
export async function saveMetaPlatformConfig(i: MetaConfigInput) {
  const row = await readRow();
  const config: Record<string, string> = { ...(row?.config ?? {}) };
  for (const [k, v] of [["appId", i.appId], ["configId", i.configId], ["businessId", i.businessId], ["graphVersion", i.graphVersion]] as const) {
    if (v !== undefined) { if (v) config[k] = v.trim(); else delete config[k]; }
  }
  const values = {
    provider: META_PROVIDER, config, enabled: true, updatedAt: new Date(),
    apiKeyEnc: i.appSecret ? encrypt(i.appSecret.trim()) : row?.apiKeyEnc ?? null,
    webhookSecretEnc: i.verifyToken ? encrypt(i.verifyToken.trim()) : row?.webhookSecretEnc ?? null,
  };
  await db.insert(schema.platformGateways).values(values).onConflictDoUpdate({ target: schema.platformGateways.provider, set: values });
  invalidateMetaPlatformConfig();
}

export async function recordMetaTest(ok: boolean, message: string) {
  const row = await readRow();
  if (!row) return;
  await db.update(schema.platformGateways).set({ lastTestAt: new Date(), lastTestOk: ok, config: { ...row.config, lastTestMessage: message.slice(0, 200) } }).where(eq(schema.platformGateways.id, row.id));
}

export async function clearMetaPlatformConfig() {
  await db.delete(schema.platformGateways).where(eq(schema.platformGateways.provider, META_PROVIDER));
  invalidateMetaPlatformConfig();
}

export const generateVerifyToken = () => randomBytes(24).toString("base64url");

/** Graph "app access token" check: GET /{app-id}?fields=id,name&access_token={app-id}|{app-secret}. Never logs the secret. */
export async function testMetaCredentials(input: { appId?: string; appSecret?: string }): Promise<{ ok: boolean; message: string; appName?: string }> {
  const c = await getMetaPlatformConfig({ fresh: true });
  const appId = input.appId || c.appId, secret = input.appSecret || c.appSecret;
  if (!appId || !secret) return { ok: false, message: "Enter the App ID and App Secret first." };
  const url = new URL(`${c.graphBase}/${c.graphVersion}/${encodeURIComponent(appId)}`);
  url.search = new URLSearchParams({ fields: "id,name", access_token: `${appId}|${secret}` }).toString();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    const j = await res.json().catch(() => ({})) as { id?: string; name?: string; error?: { message?: string } };
    if (!res.ok || !j.id) return { ok: false, message: j.error?.message ?? `Meta rejected these credentials (HTTP ${res.status}).` };
    if (String(j.id) !== String(appId)) return { ok: false, message: "Meta answered for a different app id." };
    return { ok: true, message: `Connected to Meta app “${j.name ?? appId}”.`, appName: j.name };
  } catch (e) {
    return { ok: false, message: `Could not reach the Meta Graph API (${(e as Error).message}).` };
  }
}
