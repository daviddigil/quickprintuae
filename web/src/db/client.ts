import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export function createDb(url = process.env.DATABASE_URL ?? "postgres://qp:qp@localhost:5432/quickprint") {
  const client = postgres(url, { max: 10 });
  return { db: drizzle(client, { schema }), client };
}
export type DB = ReturnType<typeof createDb>["db"];
