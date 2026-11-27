try { process.loadEnvFile(".env"); } catch { /* no .env file: use defaults */ }
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { isRealProduction } from "../src/lib/runtime";
import { eq, isNull, and } from "drizzle-orm";
import { createDb } from "../src/db/client";
import * as schema from "../src/db/schema";
import { ensurePlans, provisionTenant } from "../src/server/provision";
import { backfillTrustKeys } from "../src/server/trust/keys";

async function main() {
  const { db, client } = createDb();
  await ensurePlans(db);
  // default AI price (AED per AI business-card design, billed to the shop on its monthly invoice). Never overrides a rate the superadmin set.
  await db.insert(schema.usageRates).values({ kind: "ai_card_design", priceAed: 1, active: true }).onConflictDoNothing();

  const realProd = isRealProduction();
  const saEmail = process.env.SUPERADMIN_EMAIL ?? "admin@quickprint.ae";
  // real production never uses the published default: a missing or default SUPERADMIN_PASSWORD becomes a random one, shown once in this log
  const given = process.env.SUPERADMIN_PASSWORD || "";
  const generated = realProd && (!given || given === "change-me-now");
  const saPass = generated ? randomBytes(18).toString("base64url") : given || "change-me-now";
  const sa = await db.query.users.findFirst({ where: and(eq(schema.users.email, saEmail), isNull(schema.users.tenantId)) });
  if (!sa) {
    await db.insert(schema.users).values({ role: "superadmin", email: saEmail, name: "Platform Admin", passwordHash: await bcrypt.hash(saPass, 10) });
    console.log(generated ? `superadmin: ${saEmail} / ${saPass}   <- generated for this deployment, shown ONCE: save it now and change it after first login` : `superadmin: ${saEmail} / ${saPass}`);
  }

  // the demo shop has published passwords: never in real production, and off by default everywhere except local development
  if (realProd && process.env.SEED_DEMO !== "false") console.warn("[seed] SEED_DEMO ignored: the demo shop is never created in production.");
  if (!realProd && process.env.SEED_DEMO !== "false") {
    const demo = await db.query.tenants.findFirst({ where: eq(schema.tenants.slug, "demo") });
    if (!demo) {
      const { tenant } = await provisionTenant(db, {
        shopName: "Demo Print Hub", slug: "demo", ownerName: "Demo Owner",
        ownerEmail: "owner@demo.ae", ownerPassword: "owner12345", phone: "+971500000000", emirate: "Dubai", verified: true,
      });
      await db.update(schema.tenants).set({ address: "Al Karama, Dubai", trn: "100000000000003" }).where(eq(schema.tenants.id, tenant.id));
      await db.insert(schema.users).values({ tenantId: tenant.id, role: "customer", email: "customer@demo.ae", name: "Demo Customer", phone: "+971501111111", passwordHash: await bcrypt.hash("customer123", 10) });
      console.log("demo store: /s/demo  owner@demo.ae / owner12345  customer@demo.ae / customer123");
    }
  }
  // Demo shop: switch the walk-in QR queue on so it can be tried straight away (real shops enable it themselves in /admin/walk-in).
  const demoShop = await db.query.tenants.findFirst({ where: eq(schema.tenants.slug, "demo") });
  if (demoShop && demoShop.settings?.walkIn?.enabled === undefined) {
    await db.update(schema.tenants).set({ settings: { ...demoShop.settings, walkIn: { ...(demoShop.settings?.walkIn ?? {}), enabled: true } } }).where(eq(schema.tenants.id, demoShop.id));
    console.log("demo store: walk-in QR queue enabled -> /s/demo/walk-in  (shop view: /admin/walk-in)");
  }
  // the demo shop is exempt from seller verification (existing real shops are not)
  await db.update(schema.tenants).set({ verificationStatus: "verified" }).where(and(eq(schema.tenants.slug, "demo"), eq(schema.tenants.verificationStatus, "unverified")));
  // exact canonical email/phone keys for old owner accounts (one person = one shop owner); idempotent
  const keys = await backfillTrustKeys(db);
  if (keys.updated || keys.conflicts) console.log(`trust keys: ${keys.updated} owner accounts updated, ${keys.conflicts} conflicts left for review`);
  await client.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
