import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const LOCK_ID = 727274; // arbitrary advisory-lock key so two containers never migrate at once

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await sql`SELECT pg_advisory_lock(${LOCK_ID})`;
    await sql`CREATE EXTENSION IF NOT EXISTS citext`;
    await sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`;
    await migrate(drizzle(sql), { migrationsFolder: process.env.MIGRATIONS_DIR ?? "./drizzle" });
    console.log("migrations applied");
  } finally {
    await sql`SELECT pg_advisory_unlock(${LOCK_ID})`.catch(() => {});
    await sql.end();
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
