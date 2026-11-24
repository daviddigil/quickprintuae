try { process.loadEnvFile(".env"); } catch { /* no .env file: use defaults */ }
import bcrypt from "bcryptjs";
import { eq, isNull, and } from "drizzle-orm";
import { createDb } from "../src/db/client";
import * as schema from "../src/db/schema";
import { ensurePlans, provisionTenant } from "../src/server/provision";

async function main() {
  const { db, client } = createDb();
  await ensurePlans(db);

  const saEmail = process.env.SUPERADMIN_EMAIL ?? "admin@quickprint.ae";
  const saPass = process.env.SUPERADMIN_PASSWORD || "change-me-now";
  const sa = await db.query.users.findFirst({ where: and(eq(schema.users.email, saEmail), isNull(schema.users.tenantId)) });
  if (!sa) {
    await db.insert(schema.users).values({ role: "superadmin", email: saEmail, name: "Platform Admin", passwordHash: await bcrypt.hash(saPass, 10) });
    console.log(`superadmin: ${saEmail} / ${saPass}`);
  }

  if (process.env.SEED_DEMO !== "false") {
    const demo = await db.query.tenants.findFirst({ where: eq(schema.tenants.slug, "demo") });
    if (!demo) {
      const { tenant } = await provisionTenant(db, {
        shopName: "Demo Print Hub", slug: "demo", ownerName: "Demo Owner",
        ownerEmail: "owner@demo.ae", ownerPassword: "owner12345", phone: "+971500000000", emirate: "Dubai",
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
  await client.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
