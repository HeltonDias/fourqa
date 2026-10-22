import type { MetaStore } from "../../persistence/contracts.js";
import { PlanningConflictError } from "../../persistence/planningConflict.js";
import { query, withTransaction } from "./pool.js";
import type { PoolClient } from "pg";

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

async function lockMetaKey(client: PoolClient, key: string): Promise<void> {
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`fourqa-meta:${key}`]);
}

async function readMeta(client: PoolClient, key: string): Promise<string | null> {
  const row = await client.query<{ value: string | null }>("SELECT value FROM workbook_meta WHERE key = $1", [key]);
  return row.rows[0]?.value ?? null;
}

async function replaceHeaderIf(
  expectedTitle: string,
  expectedSubtitle: string,
  title: string,
  subtitle: string,
  defaultTitle: string,
  defaultSubtitle: string,
): Promise<void> {
  await withTransaction(async (client) => {
    for (const key of ["cabecalho_subtitulo", "cabecalho_titulo", "title"].sort()) {
      await lockMetaKey(client, key);
    }
    const effectiveTitle = ((await readMeta(client, "cabecalho_titulo")) ?? (await readMeta(client, "title")) ?? defaultTitle).trim();
    const effectiveSubtitle = ((await readMeta(client, "cabecalho_subtitulo")) ?? defaultSubtitle).trim();
    if (effectiveTitle !== expectedTitle.trim() || effectiveSubtitle !== expectedSubtitle.trim()) {
      throw new PlanningConflictError(PlanningConflictError.headerChanged);
    }
    await client.query(UPSERT_META, ["cabecalho_titulo", title.trim()]);
    await client.query(UPSERT_META, ["cabecalho_subtitulo", subtitle.trim()]);
  });
}

async function replacePeriodIf(expectedInicio: string, expectedFim: string, inicio: string, fim: string): Promise<void> {
  await withTransaction(async (client) => {
    for (const key of ["data_fim", "data_inicio"].sort()) {
      await lockMetaKey(client, key);
    }
    const currentInicio = (await readMeta(client, "data_inicio")) ?? "";
    const currentFim = (await readMeta(client, "data_fim")) ?? "";
    if (currentInicio !== expectedInicio || currentFim !== expectedFim) {
      throw new PlanningConflictError(PlanningConflictError.periodChanged);
    }
    await client.query(UPSERT_META, ["data_inicio", inicio]);
    await client.query(UPSERT_META, ["data_fim", fim]);
  });
}

export const postgresMetaStore = {
  get,
  set,
  setMany,
  replaceHeaderIf,
  replacePeriodIf,
} satisfies MetaStore;
