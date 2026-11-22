/** Production migration runner (bundled to dist-scripts/migrate.cjs in Docker; no drizzle-kit needed at runtime). */
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import path from "path";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  const client = postgres(url, { max: 1, onnotice: () => {} });
  await migrate(drizzle(client), { migrationsFolder: process.env.MIGRATIONS_DIR ?? path.join(process.cwd(), "drizzle") });
  await client.end();
  console.log("migrations applied");
}
main().catch((e) => { console.error(e); process.exit(1); });
