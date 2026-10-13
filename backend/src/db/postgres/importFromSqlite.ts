import { DatabaseSync } from "node:sqlite";
import type { PoolClient } from "pg";
import { getDbPath } from "../../db.js";
import { migratePostgres } from "./migrate.js";
import { asNumber, bind, getPool, withTransaction } from "./pool.js";

const TABLES: { name: string; columns: string[]; identity: boolean }[] = [
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
    columns: ["id", "revision_id", "suite_id", "suite_name", "planned_start", "planned_end", "baseline_quantity"],
    identity: true,
  },
  {
    name: "planning_allocation",
    columns: ["id", "item_id", "alloc_date", "planned_quantity"],
    identity: true,
  },
];

function countOf(db: { prepare(sql: string): { get(): unknown } }, table: string): number {
  const row = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number };
  return Number(row.n);
}

async function postgresCount(table: string): Promise<number> {
  const result = await getPool().query<{ n: unknown }>(`SELECT COUNT(*) AS n FROM ${table}`);
  return asNumber(result.rows[0]?.n ?? 0);
}

async function alignSequences(client: PoolClient): Promise<{ table: string; nextId: number }[]> {
  const report: { table: string; nextId: number }[] = [];
  for (const table of TABLES.filter((item) => item.identity)) {
    const max = await client.query<{ max: unknown }>(`SELECT MAX(id) AS max FROM ${table.name}`);
    const highest = max.rows[0]?.max == null ? 0 : asNumber(max.rows[0].max);
    await client.query(`SELECT setval(pg_get_serial_sequence($1, 'id')::regclass, $2, $3)`, [
      table.name,
      highest > 0 ? highest : 1,
      highest > 0,
    ]);
    report.push({ table: table.name, nextId: highest > 0 ? highest + 1 : 1 });
  }
  return report;
}

async function insertAll(client: PoolClient, sqlite: DatabaseSync): Promise<void> {
  for (const table of TABLES) {
    const rows = sqlite.prepare(`SELECT ${table.columns.join(", ")} FROM ${table.name}`).all() as Record<string, unknown>[];
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
      await client.query(
        `INSERT INTO ${table.name} (${table.columns.join(", ")}) VALUES ${groups.join(", ")}`,
        values,
      );
    }
  }
}

export async function importSqliteIntoPostgres(): Promise<{
  status: "imported" | "already-matched";
  counts: Record<string, number>;
  sequences: { table: string; nextId: number }[];
}> {
  await migratePostgres();
  const sqlite = new DatabaseSync(getDbPath(), { readOnly: true });
  try {
    const counts: Record<string, number> = {};
    const postgresCounts: Record<string, number> = {};
    for (const table of TABLES) {
      counts[table.name] = countOf(sqlite, table.name);
      postgresCounts[table.name] = await postgresCount(table.name);
    }
    const mismatches = TABLES.filter((table) => counts[table.name] !== postgresCounts[table.name]);
    const postgresEmpty = TABLES.every((table) => postgresCounts[table.name] === 0);
    if (!postgresEmpty && mismatches.length > 0) {
      const detail = mismatches
        .map((table) => `${table.name} sqlite=${counts[table.name]} postgres=${postgresCounts[table.name]}`)
        .join("; ");
      throw new Error(`Migração interrompida sem apagar dados. Contagens divergentes: ${detail}`);
    }
    if (!postgresEmpty) {
      const sequences = await withTransaction((client) => alignSequences(client));
      return { status: "already-matched", counts, sequences };
    }
    const sequences = await withTransaction(async (client) => {
      await insertAll(client, sqlite);
      return alignSequences(client);
    });
    return { status: "imported", counts, sequences };
  } finally {
    sqlite.close();
  }
}
