import type { MetaStore } from "../../persistence/contracts.js";
import { query } from "./pool.js";

async function get(key: string): Promise<string | null> {
  const rows = await query<{ value: string | null }>("SELECT value FROM workbook_meta WHERE key = $1", [key]);
  return rows[0]?.value ?? null;
}

async function set(key: string, value: string): Promise<void> {
  await query(
    `INSERT INTO workbook_meta (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [key, value],
  );
}

export const postgresMetaStore = {
  get,
  set,
} satisfies MetaStore;
