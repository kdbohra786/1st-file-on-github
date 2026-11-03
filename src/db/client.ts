import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getEnv } from "@/lib/env";
import * as schema from "./schema";

const g = globalThis as unknown as { __sql?: ReturnType<typeof postgres> };

export function getSql() {
  if (!g.__sql) g.__sql = postgres(getEnv().DATABASE_URL, { max: 10, onnotice: () => {} });
  return g.__sql;
}

export const getDb = () => drizzle(getSql(), { schema });
export type Db = ReturnType<typeof getDb>;
