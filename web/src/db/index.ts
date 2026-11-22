import "server-only";
import { createDb, type DB } from "./client";
import * as schema from "./schema";

const g = globalThis as unknown as { __qpdb?: DB };
export const db: DB = g.__qpdb ?? createDb().db;
if (process.env.NODE_ENV !== "production") g.__qpdb = db;
export { schema };
