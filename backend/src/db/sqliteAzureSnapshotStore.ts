import { getDb } from "../db.js";
import type { AzureSnapshotStore } from "../persistence/contracts.js";
import type { ExecucaoRow, FalhaRow } from "../types.js";

export type AzureSnapshot = {
  execucoes: Omit<ExecucaoRow, "id">[];
  falhas: Omit<FalhaRow, "id">[];
  meta: Record<string, string>;
};

export interface PageParams {
  planKey?: string;
  limit: number;
  offset: number;
  q: string;
}

export interface PageResult<T> {
  total: number;
  limit: number;
  offset: number;
  rows: T[];
}

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

const EXEC_SEARCH = [
  "plan_key", "plan_name", "frente", "atalho", "processo", "suite_name", "test_case_title",
  "test_case_state", "test_point_state", "outcome", "run_by", "test_case_tags",
];
const FALHA_SEARCH = [
  "plan_key", "responsavel", "ambiente", "categoria", "titulo", "status", "frente", "tags",
];

function likeParam(q: string): string {
  return `%${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
}

/**
 * Substitui todas as execuções e falhas e grava só as metas do payload.
 * A troca é global, não por PlanKey. Falha no meio restaura o snapshot anterior.
 */
export function replaceSnapshot(input: AzureSnapshot): void {
  const d = getDb();
  d.exec("BEGIN IMMEDIATE");
  try {
    d.exec("DELETE FROM execucoes; DELETE FROM falhas;");

    const insExec = d.prepare(
      `INSERT INTO execucoes (${EXECUCAO_COLUMNS.join(", ")}) VALUES (${EXECUCAO_COLUMNS.map(() => "?").join(", ")})`,
    );
    for (const row of input.execucoes) insExec.run(...EXECUCAO_COLUMNS.map((c) => row[c]));

    const insFalha = d.prepare(
      `INSERT INTO falhas (${FALHA_COLUMNS.join(", ")}) VALUES (${FALHA_COLUMNS.map(() => "?").join(", ")})`,
    );
    for (const row of input.falhas) insFalha.run(...FALHA_COLUMNS.map((c) => row[c]));

    const upsert = d.prepare("INSERT OR REPLACE INTO workbook_meta (key, value) VALUES (?, ?)");
    for (const [k, v] of Object.entries(input.meta)) upsert.run(k, v);

    d.exec("COMMIT");
  } catch (err) {
    d.exec("ROLLBACK");
    throw err;
  }
}

export function listExecucoes(planKey: string): ExecucaoRow[] {
  return getDb()
    .prepare("SELECT * FROM execucoes WHERE plan_key = ? ORDER BY id")
    .all(planKey) as ExecucaoRow[];
}

export function listFalhas(planKey: string): FalhaRow[] {
  return getDb()
    .prepare("SELECT * FROM falhas WHERE plan_key = ? ORDER BY id")
    .all(planKey) as FalhaRow[];
}

function queryPage<T>(table: "execucoes" | "falhas", columns: string[], params: PageParams): PageResult<T> {
  const where: string[] = [];
  const args: (string | number)[] = [];
  if (params.planKey) {
    where.push("plan_key = ?");
    args.push(params.planKey);
  }
  if (params.q) {
    where.push(`(${columns.map((c) => `${c} LIKE ? ESCAPE '\\'`).join(" OR ")})`);
    const like = likeParam(params.q);
    for (let i = 0; i < columns.length; i++) args.push(like);
  }
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const total = (getDb().prepare(`SELECT COUNT(*) AS n FROM ${table} ${clause}`).get(...args) as { n: number }).n;
  const rows = getDb()
    .prepare(`SELECT * FROM ${table} ${clause} ORDER BY id LIMIT ? OFFSET ?`)
    .all(...args, params.limit, params.offset) as T[];
  return { total, limit: params.limit, offset: params.offset, rows };
}

export function queryExecucoes(params: PageParams): PageResult<ExecucaoRow> {
  return queryPage("execucoes", EXEC_SEARCH, params);
}

export function queryFalhas(params: PageParams): PageResult<FalhaRow> {
  return queryPage("falhas", FALHA_SEARCH, params);
}

export const sqliteAzureSnapshotStore = {
  replaceSnapshot,
  listExecucoes,
  listFalhas,
  queryExecucoes,
  queryFalhas,
} satisfies AzureSnapshotStore;
