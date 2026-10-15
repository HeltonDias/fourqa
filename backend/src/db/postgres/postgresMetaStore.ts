import type { MetaStore } from "../../persistence/contracts.js";
import { query, withTransaction } from "./pool.js";

async function get(key: string): Promise<string | null> {
  const rows = await query<{ value: string | null }>("SELECT value FROM workbook_meta WHERE key = $1", [key]);
  return rows[0]?.value ?? null;
}

const UPSERT_META = `INSERT INTO workbook_meta (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;

async function set(key: string, value: string): Promise<void> {
  await query(UPSERT_META, [key, value]);
}

async function setMany(entries: Record<string, string>): Promise<void> {
  await withTransaction(async (client) => {
    for (const [key, value] of Object.entries(entries)) {
      await client.query(UPSERT_META, [key, value]);
    }
  });
}

export const postgresMetaStore = {
  get,
  set,
  setMany,
} satisfies MetaStore;
