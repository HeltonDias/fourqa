import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getPool } from "./pool.js";

const BASELINE = path.join(path.dirname(fileURLToPath(import.meta.url)), "migrations", "001_baseline.sql");

export async function migratePostgres(): Promise<void> {
  const pool = getPool();
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version integer PRIMARY KEY,
    applied_at text NOT NULL
  )`);
  const current = await pool.query<{ v: number | string }>("SELECT COALESCE(MAX(version), 0) AS v FROM schema_migrations");
  if (Number(current.rows[0]?.v ?? 0) >= 1) return;

  const sql = readFileSync(BASELINE, "utf8");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("INSERT INTO schema_migrations (version, applied_at) VALUES (1, $1)", [new Date().toISOString()]);
    await client.query("COMMIT");
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignora falha de rollback */
    }
    throw err;
  } finally {
    client.release();
  }
}
