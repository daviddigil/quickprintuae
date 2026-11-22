import { defineConfig } from "drizzle-kit";

try { process.loadEnvFile(".env"); } catch { /* no .env file */ }
export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL ?? "postgres://qp:qp@localhost:5432/quickprint" },
});
