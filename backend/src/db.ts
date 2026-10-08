import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { migrate, SCHEMA_VERSION, schemaVersion } from "./db/migrate.js";
import type { ExecucaoRow, FalhaRow, PlanejamentoLinha } from "./types.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const defaultDb = path.join(rootDir, "data", "fourqa.db");
/** Legado: banco já criado com o nome anterior. Adotado só quando fourqa.db ainda não existe. */
const legacyDefaultDb = path.join(rootDir, "data", "motor_qa.db");

let db: DatabaseSync | null = null;

function configuredDbPath(): string {
  return process.env.FOURQA_DB?.trim() || "";
}

/** Move o arquivo legado para o caminho novo. Se estiver em uso, devolve o caminho antigo nesta abertura. */
export function adoptRenamedDatabase(target: string, legacy: string, explicitPath: boolean): string {
  if (explicitPath || fs.existsSync(target) || !fs.existsSync(legacy)) return target;
  try {
    fs.renameSync(legacy, target);
    for (const suffix of ["-wal", "-shm", "-journal"]) {
      const from = `${legacy}${suffix}`;
      if (fs.existsSync(from)) fs.renameSync(from, `${target}${suffix}`);
    }
    return target;
  } catch {
    return legacy;
  }
}

export function getDbPath(): string {
  const configured = configuredDbPath();
  if (configured) return configured;
  return adoptRenamedDatabase(defaultDb, legacyDefaultDb, false);
}

export function getDb(): DatabaseSync {
  if (!db) {
    db = new DatabaseSync(getDbPath(), { allowExtension: false });
    db.exec("PRAGMA journal_mode = WAL;");
    migrate(db);
  }
  return db;
}

export function dbReady(): boolean {
  try {
    return schemaVersion(getDb()) >= SCHEMA_VERSION;
  } catch {
    return false;
  }
}

export function getMeta(key: string): string | null {
  const row = getDb()
    .prepare("SELECT value FROM workbook_meta WHERE key = ?")
    .get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setMeta(key: string, value: string): void {
  getDb().prepare("INSERT OR REPLACE INTO workbook_meta (key, value) VALUES (?, ?)").run(key, value);
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

/**
 * Substitui execucoes e falhas (LimparAntes = SIM nos scripts) e grava metadados,
 * tudo em uma única transação: se algo falhar, os dados anteriores permanecem.
 */
export function replaceAzureData(input: {
  execucoes: Omit<ExecucaoRow, "id">[];
  falhas: Omit<FalhaRow, "id">[];
  meta: Record<string, string>;
}): void {
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

const PAGE_MIN = 1;
const PAGE_MAX = 200;

export function parsePageQuery(query: {
  limit?: unknown;
  offset?: unknown;
  q?: unknown;
}): { limit: number; offset: number; q: string } {
  const limit = Math.min(PAGE_MAX, Math.max(PAGE_MIN, Math.trunc(Number(query.limit) || 50)));
  const offset = Math.max(0, Math.trunc(Number(query.offset) || 0));
  const q = typeof query.q === "string" ? query.q.trim().slice(0, 200) : "";
  return { limit, offset, q };
}

function likeParam(q: string): string {
  return `%${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
}

export function listExecucoesAll(planKey: string): ExecucaoRow[] {
  return getDb()
    .prepare("SELECT * FROM execucoes WHERE plan_key = ? ORDER BY id")
    .all(planKey) as ExecucaoRow[];
}

export function listFalhasAll(planKey: string): FalhaRow[] {
  return getDb()
    .prepare("SELECT * FROM falhas WHERE plan_key = ? ORDER BY id")
    .all(planKey) as FalhaRow[];
}

const EXEC_SEARCH = [
  "plan_key", "plan_name", "frente", "atalho", "processo", "suite_name", "test_case_title",
  "test_case_state", "test_point_state", "outcome", "run_by", "test_case_tags",
];
const FALHA_SEARCH = [
  "plan_key", "responsavel", "ambiente", "categoria", "titulo", "status", "frente", "tags",
];

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

/** Planilha importada, sem plan_key. Quem aplica estas linhas precisa limitar ao plano dono. */
export function listPlanejamentoBase(): Omit<
  PlanejamentoLinha,
  | "cts_passeds"
  | "cts_na"
  | "cts_falhados"
  | "cts_bloqueados"
  | "cts_liberados"
  | "cts_design"
  | "cts_nao_liberados"
  | "total_realizado"
>[] {
  return getDb()
    .prepare(
      `SELECT row_num, qa, prioridades, frente, processo, data_inicio, data_fim,
              replanejamento, qtd_cts_plan, cts_plan_dia, cts_cancelados
       FROM planejamento_linhas ORDER BY row_num`,
    )
    .all() as Omit<
    PlanejamentoLinha,
    | "cts_passeds"
    | "cts_na"
    | "cts_falhados"
    | "cts_bloqueados"
    | "cts_liberados"
    | "cts_design"
    | "cts_nao_liberados"
    | "total_realizado"
  >[];
}
