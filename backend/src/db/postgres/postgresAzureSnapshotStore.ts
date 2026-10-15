import type { PoolClient } from "pg";
import type { AzureSnapshotStore } from "../../persistence/contracts.js";
import type { ExecucaoRow, FalhaRow } from "../../types.js";
import { requiredPlanKey } from "../../persistence/planKey.js";
import type { AzureSnapshot, PageParams, PageResult } from "../sqliteAzureSnapshotStore.js";
import { asNumber, asNumberOrNull, asText, bind, query, withTransaction } from "./pool.js";

const EXECUCAO_COLUMNS = [
  "plan_key", "plan_id", "plan_name", "frente", "atalho", "processo", "suite_id", "suite_name",
  "parent_suite_id", "suite_depth", "suite_path", "dimensions_json",
  "test_point_id", "test_case_id", "test_case_title", "responsabilidade", "test_case_state",
  "test_point_state", "outcome", "date_completed", "run_by", "last_updated_date",
  "last_test_run_id", "last_result_id", "test_case_link", "test_case_tags",
] as const satisfies readonly (keyof ExecucaoRow)[];

const FALHA_COLUMNS = [
  "plan_key", "responsavel", "ambiente", "categoria", "bug_id", "impacto", "frente",
  "titulo", "status", "criacao", "fechamento", "links", "tags",
] as const satisfies readonly (keyof FalhaRow)[];

const EXEC_INT = new Set([
  "id", "plan_id", "suite_id", "parent_suite_id", "suite_depth", "test_point_id", "test_case_id",
  "last_test_run_id", "last_result_id",
]);
const FALHA_INT = new Set(["id", "bug_id"]);
const FALHA_REAL = new Set(["impacto"]);

const EXEC_SEARCH = [
  "plan_key", "plan_name", "frente", "atalho", "processo", "suite_name", "test_case_title",
  "test_case_state", "test_point_state", "outcome", "run_by", "test_case_tags",
];
const FALHA_SEARCH = [
  "plan_key", "responsavel", "ambiente", "categoria", "titulo", "status", "frente", "tags",
];

const REPLACE_LOCK = "LOCK TABLE execucoes, falhas, workbook_meta IN EXCLUSIVE MODE";

function likeParam(q: string): string {
  return `%${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
}

function execOf(row: Record<string, unknown>): ExecucaoRow {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (EXEC_INT.has(key)) out[key] = asNumberOrNull(value);
    else out[key] = asText(value);
  }
  return out as ExecucaoRow;
}

function falhaOf(row: Record<string, unknown>): FalhaRow {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (FALHA_INT.has(key)) out[key] = asNumberOrNull(value);
    else if (FALHA_REAL.has(key)) out[key] = asNumberOrNull(value);
    else out[key] = asText(value);
  }
  return out as FalhaRow;
}

async function insertRows(client: PoolClient, table: string, columns: readonly string[], rows: Record<string, unknown>[]): Promise<void> {
  const sql = `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(", ")})`;
  for (const row of rows) {
    await client.query(sql, columns.map((column) => bind(row[column])));
  }
}

async function replaceSnapshot(input: AzureSnapshot): Promise<void> {
  await withTransaction(async (client) => {
    await client.query("DELETE FROM execucoes");
    await client.query("DELETE FROM falhas");
    await insertRows(client, "execucoes", EXECUCAO_COLUMNS, input.execucoes);
    await insertRows(client, "falhas", FALHA_COLUMNS, input.falhas);
    for (const [key, value] of Object.entries(input.meta)) {
      await client.query(
        `INSERT INTO workbook_meta (key, value) VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [key, value],
      );
    }
  }, REPLACE_LOCK);
}

async function listExecucoes(planKey: string): Promise<ExecucaoRow[]> {
  const rows = await query<Record<string, unknown>>("SELECT * FROM execucoes WHERE plan_key = $1 ORDER BY id", [planKey]);
  return rows.map(execOf);
}

async function listFalhas(planKey: string): Promise<FalhaRow[]> {
  const rows = await query<Record<string, unknown>>("SELECT * FROM falhas WHERE plan_key = $1 ORDER BY id", [planKey]);
  return rows.map(falhaOf);
}

async function queryPage<T>(
  table: "execucoes" | "falhas",
  columns: string[],
  params: PageParams,
  map: (row: Record<string, unknown>) => T,
): Promise<PageResult<T>> {
  const where = ["plan_key = $1"];
  const args: unknown[] = [requiredPlanKey(params.planKey)];
  if (params.q) {
    const like = likeParam(params.q);
    const parts = columns.map((column) => {
      args.push(like);
      return `${column} ILIKE $${args.length} ESCAPE '\\'`;
    });
    where.push(`(${parts.join(" OR ")})`);
  }
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const totalRows = await query<{ n: unknown }>(`SELECT COUNT(*) AS n FROM ${table} ${clause}`, args);
  const total = asNumber(totalRows[0]?.n ?? 0);
  args.push(params.limit, params.offset);
  const limit = args.length - 1;
  const rows = await query<Record<string, unknown>>(
    `SELECT * FROM ${table} ${clause} ORDER BY id LIMIT $${limit} OFFSET $${limit + 1}`,
    args,
  );
  return { total, limit: params.limit, offset: params.offset, rows: rows.map(map) };
}

async function queryExecucoes(params: PageParams): Promise<PageResult<ExecucaoRow>> {
  return queryPage("execucoes", EXEC_SEARCH, params, execOf);
}

async function queryFalhas(params: PageParams): Promise<PageResult<FalhaRow>> {
  return queryPage("falhas", FALHA_SEARCH, params, falhaOf);
}

export const postgresAzureSnapshotStore = {
  replaceSnapshot,
  listExecucoes,
  listFalhas,
  queryExecucoes,
  queryFalhas,
} satisfies AzureSnapshotStore;
