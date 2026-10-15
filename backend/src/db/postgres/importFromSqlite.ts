import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { getDbPath } from "../../db.js";
import { migratePostgres } from "./migrate.js";
import { asNumber, bind, withTransaction } from "./pool.js";
import { sameContent, sanitizeMigrationError } from "./tableSignature.js";

export interface DataTable {
  name: string;
  columns: string[];
  identity: boolean;
}

export const DATA_TABLES: DataTable[] = [
  { name: "workbook_meta", columns: ["key", "value"], identity: false },
  {
    name: "planejamento_linhas",
    columns: [
      "row_num", "qa", "prioridades", "frente", "processo", "data_inicio", "data_fim",
      "replanejamento", "qtd_cts_plan", "cts_plan_dia", "cts_cancelados",
    ],
    identity: false,
  },
  {
    name: "execucoes",
    columns: [
      "id", "plan_key", "plan_id", "plan_name", "frente", "atalho", "processo", "suite_id", "suite_name",
      "parent_suite_id", "suite_depth", "suite_path", "dimensions_json",
      "test_point_id", "test_case_id", "test_case_title", "responsabilidade", "test_case_state",
      "test_point_state", "outcome", "date_completed", "run_by", "last_updated_date",
      "last_test_run_id", "last_result_id", "test_case_link", "test_case_tags",
    ],
    identity: true,
  },
  {
    name: "falhas",
    columns: [
      "id", "plan_key", "responsavel", "ambiente", "categoria", "bug_id", "impacto", "frente",
      "titulo", "status", "criacao", "fechamento", "links", "tags",
    ],
    identity: true,
  },
  { name: "planning", columns: ["id", "plan_key", "created_at"], identity: true },
  {
    name: "planning_revision",
    columns: ["id", "planning_id", "version", "created_at", "reason", "baseline_origin", "scope_snapshot"],
    identity: true,
  },
  {
    name: "planning_scope_item",
    columns: ["id", "revision_id", "plan_id", "suite_id", "test_point_id", "test_case_id", "label"],
    identity: true,
  },
  {
    name: "planning_item",
    columns: [
      "id", "revision_id", "suite_id", "suite_name", "test_point_id", "test_case_id",
      "planned_start", "planned_end", "baseline_quantity", "responsavel", "prioridade",
    ],
    identity: true,
  },
  {
    name: "planning_allocation",
    columns: ["id", "item_id", "alloc_date", "planned_quantity"],
    identity: true,
  },
];

export function orderKey(table: DataTable): string {
  if (table.name === "workbook_meta") return "key";
  if (table.name === "planejamento_linhas") return "row_num";
  return "id";
}

export type SqlQuery = (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;

export interface ImportPorts {
  migrate(): Promise<void>;
  transaction<T>(fn: (query: SqlQuery) => Promise<T>): Promise<T>;
}

export interface ImportResult {
  status: "imported" | "already-matched";
  counts: Record<string, number>;
  sequences: { table: string; nextId: number }[];
}

export function resolveSqliteSource(sourcePath?: string): string {
  const explicit = sourcePath?.trim();
  if (!explicit) return getDbPath();
  const resolved = path.resolve(explicit);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    throw new Error("Arquivo SQLite de origem não encontrado");
  }
  return resolved;
}

function livePorts(): ImportPorts {
  return {
    migrate: () => migratePostgres(),
    transaction: (fn) =>
      withTransaction((client) =>
        fn(async (sql, params = []) => {
          const result = await client.query(sql, params);
          return { rows: result.rows as Record<string, unknown>[] };
        }),
      ),
  };
}

/** Coluna ausente num SQLite antigo entra como NULL, sem descartar a identidade quando ela existe. */
export function columnSelectList(present: ReadonlySet<string>, columns: string[]): string {
  return columns.map((column) => (present.has(column) ? column : `NULL AS ${column}`)).join(", ");
}

function presentColumns(sqlite: DatabaseSync, table: string): Set<string> {
  const rows = sqlite.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return new Set(rows.map((row) => row.name));
}

function countOf(db: DatabaseSync, table: string): number {
  const row = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number };
  return Number(row.n);
}

async function postgresCount(query: SqlQuery, table: string): Promise<number> {
  const result = await query(`SELECT COUNT(*) AS n FROM ${table}`);
  return asNumber(result.rows[0]?.n ?? 0);
}

async function alignSequences(query: SqlQuery): Promise<{ table: string; nextId: number }[]> {
  const report: { table: string; nextId: number }[] = [];
  for (const table of DATA_TABLES.filter((item) => item.identity)) {
    const max = await query(`SELECT MAX(id) AS max FROM ${table.name}`);
    const highest = max.rows[0]?.max == null ? 0 : asNumber(max.rows[0].max);
    await query(`SELECT setval(pg_get_serial_sequence($1, 'id')::regclass, $2, $3)`, [
      table.name,
      highest > 0 ? highest : 1,
      highest > 0,
    ]);
    report.push({ table: table.name, nextId: highest > 0 ? highest + 1 : 1 });
  }
  return report;
}

async function insertAll(query: SqlQuery, sqlite: DatabaseSync): Promise<void> {
  for (const table of DATA_TABLES) {
    const rows = sqlite.prepare(`SELECT ${columnSelectList(presentColumns(sqlite, table.name), table.columns)} FROM ${table.name}`).all() as Record<string, unknown>[];
    if (rows.length === 0) continue;
    const width = table.columns.length;
    const chunkSize = 80;
    for (let offset = 0; offset < rows.length; offset += chunkSize) {
      const chunk = rows.slice(offset, offset + chunkSize);
      const values: unknown[] = [];
      const groups = chunk.map((row, rowIndex) => {
        const placeholders = table.columns.map((_, columnIndex) => {
          values.push(bind(row[table.columns[columnIndex]!]));
          return `$${rowIndex * width + columnIndex + 1}`;
        });
        return `(${placeholders.join(", ")})`;
      });
      await query(`INSERT INTO ${table.name} (${table.columns.join(", ")}) VALUES ${groups.join(", ")}`, values);
    }
  }
}

function sqliteRows(sqlite: DatabaseSync, table: DataTable): Record<string, unknown>[] {
  return sqlite.prepare(`SELECT ${columnSelectList(presentColumns(sqlite, table.name), table.columns)} FROM ${table.name}`).all() as Record<string, unknown>[];
}

export async function importSqliteIntoPostgres(sourcePath?: string, ports: ImportPorts = livePorts()): Promise<ImportResult> {
  const source = resolveSqliteSource(sourcePath);
  await ports.migrate();
  const sqlite = new DatabaseSync(source, { readOnly: true });
  try {
    try {
      return await ports.transaction(async (query) => {
        for (const table of DATA_TABLES) await query(`LOCK TABLE ${table.name} IN SHARE ROW EXCLUSIVE MODE`);
        const counts: Record<string, number> = {};
        const postgresCounts: Record<string, number> = {};
        for (const table of DATA_TABLES) {
          counts[table.name] = countOf(sqlite, table.name);
          postgresCounts[table.name] = await postgresCount(query, table.name);
        }
        const postgresEmpty = DATA_TABLES.every((table) => postgresCounts[table.name] === 0);
        const mismatches = DATA_TABLES.filter((table) => counts[table.name] !== postgresCounts[table.name]);
        if (!postgresEmpty && mismatches.length > 0) {
          const detail = mismatches.map((table) => `${table.name} sqlite=${counts[table.name]} postgres=${postgresCounts[table.name]}`).join("; ");
          throw new Error(`Migração interrompida sem apagar dados. Contagens divergentes: ${detail}`);
        }
        if (!postgresEmpty) {
          for (const table of DATA_TABLES) {
            const current = await query(`SELECT ${table.columns.join(", ")} FROM ${table.name}`);
            if (!sameContent(sqliteRows(sqlite, table), current.rows, table.columns, orderKey(table))) {
              throw new Error(`Migração interrompida sem apagar dados. Conteúdo divergente: ${table.name}`);
            }
          }
          return { status: "already-matched", counts, sequences: await alignSequences(query) };
        }
        const sqliteEmpty = DATA_TABLES.every((table) => counts[table.name] === 0);
        if (!sqliteEmpty) await insertAll(query, sqlite);
        return {
          status: sqliteEmpty ? "already-matched" : "imported",
          counts,
          sequences: await alignSequences(query),
        };
      });
    } catch (err) {
      throw sanitizeMigrationError(err);
    }
  } finally {
    sqlite.close();
  }
}
