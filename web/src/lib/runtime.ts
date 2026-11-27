/**
 * Production safety switches (pure, no imports from the app so the seed script and Edge-free code can use them).
 *
 * "Real production" = NODE_ENV=production AND the public URL is not this machine. Running the production Docker image on your own PC
 * (APP_URL=http://localhost:5050) keeps the friendly demo defaults; a deployment on a real domain gets the strict rules:
 *   - the fake-mode switches (PAYMENTS_FAKE, DELIVERY_FAKE, WHATSAPP_FAKE) are ignored unless ALLOW_FAKE_IN_PRODUCTION=1
 *   - CRON_SECRET must be set to a strong value (there is no default)
 *   - the demo shop and default passwords are never created
 */
const LOCAL_URL = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|host\.docker\.internal)(:\d+)?(\/|$)/i;
const truthy = (v?: string) => ["1", "true"].includes((v ?? "").trim().toLowerCase());

export const isRealProduction = (env: NodeJS.ProcessEnv = process.env) => env.NODE_ENV === "production" && !LOCAL_URL.test(env.APP_URL ?? "http://localhost:3000");

/** Is a fake-mode switch really on? In real production it only counts with the explicit second flag. */
export function fakeFlag(name: "PAYMENTS_FAKE" | "DELIVERY_FAKE" | "WHATSAPP_FAKE", env: NodeJS.ProcessEnv = process.env): boolean {
  if (!truthy(env[name])) return false;
  return !isRealProduction(env) || truthy(env.ALLOW_FAKE_IN_PRODUCTION);
}
/** A fake switch is set in the environment but is being ignored because this is real production. */
export const ignoredFakeFlags = (env: NodeJS.ProcessEnv = process.env) =>
  (["PAYMENTS_FAKE", "DELIVERY_FAKE", "WHATSAPP_FAKE"] as const).filter((n) => truthy(env[n]) && !fakeFlag(n, env));
/** Fake mode is genuinely active in real production (dangerous: only possible with ALLOW_FAKE_IN_PRODUCTION=1). */
export const fakeActiveInRealProduction = (env: NodeJS.ProcessEnv = process.env) =>
  isRealProduction(env) && (["PAYMENTS_FAKE", "DELIVERY_FAKE", "WHATSAPP_FAKE"] as const).some((n) => fakeFlag(n, env));

const WEAK = new Set(["dev-cron", "change-me", "change-me-now", "secret", "password", "cron", "cronsecret", "test"]);
export const isStrongSecret = (s?: string) => !!s && s.length >= 24 && !WEAK.has(s.toLowerCase());

/** Problems that must stop a real-production server from starting. */
export function fatalProductionProblems(env: NodeJS.ProcessEnv = process.env): string[] {
  if (!isRealProduction(env)) return [];
  const out: string[] = [];
  if (!isStrongSecret(env.CRON_SECRET)) out.push("CRON_SECRET must be set to a random value of at least 24 characters (openssl rand -hex 32). Cron endpoints would otherwise be callable by anyone.");
  if (!isStrongSecret(env.AUTH_SECRET)) out.push("AUTH_SECRET must be set to a random value of at least 24 characters.");
  if (!isStrongSecret(env.ENCRYPTION_KEY)) out.push("ENCRYPTION_KEY must be set to a random value of at least 24 characters.");
  return out;
}

/** Warnings shown in the logs, /api/health and the superadmin banner. */
export function productionWarnings(env: NodeJS.ProcessEnv = process.env): string[] {
  if (!isRealProduction(env)) return [];
  const out: string[] = [];
  const ign = ignoredFakeFlags(env);
  if (ign.length) out.push(`${ign.join(", ")} ${ign.length > 1 ? "are" : "is"} set but ignored in production (set ALLOW_FAKE_IN_PRODUCTION=1 only for a staging demo).`);
  if (fakeActiveInRealProduction(env)) out.push("FAKE MODE IS ACTIVE IN PRODUCTION: customers can complete checkout without paying. Remove PAYMENTS_FAKE / ALLOW_FAKE_IN_PRODUCTION.");
  if ((env.SUPERADMIN_PASSWORD ?? "") === "change-me-now") out.push("SUPERADMIN_PASSWORD is still the published default.");
  if (truthy(env.SEED_DEMO)) out.push("SEED_DEMO is on: the demo shop has published passwords. Turn it off and delete the demo shop.");
  return out;
}
