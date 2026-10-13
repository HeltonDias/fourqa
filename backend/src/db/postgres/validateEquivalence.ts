import { DatabaseSync } from "node:sqlite";
import { groupExecucoesForReport } from "../../domain/reportGroups.js";
import { inferDimensions, type DetectedDimension } from "../../domain/dimensions.js";
import { getDbPath } from "../../db.js";
import type { ExecucaoRow } from "../../types.js";
import { asNumber, getPool } from "./pool.js";

const TABLES = [
  "workbook_meta",
  "planejamento_linhas",
  "execucoes",
  "falhas",
  "planning",
  "planning_revision",
  "planning_scope_item",
  "planning_item",
  "planning_allocation",
] as const;

function stable(value: unknown): unknown {
  if (value == null) return null;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number") return Object.is(value, -0) ? 0 : value;
  if (Array.isArray(value)) return value.map(stable);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as object).sort()) out[key] = stable((value as Record<string, unknown>)[key]);
    return out;
  }
  return value;
}

function signature(rows: Record<string, unknown>[]): string {
  return JSON.stringify(rows.map((row) => stable(row)));
}

function sqliteRows(db: DatabaseSync, sql: string): Record<string, unknown>[] {
  return db.prepare(sql).all() as Record<string, unknown>[];
}

async function postgresRows(sql: string): Promise<Record<string, unknown>[]> {
  const result = await getPool().query<Record<string, unknown>>(sql);
  return result.rows;
}

function catalogOf(meta: Record<string, unknown>[], planKey: string): DetectedDimension[] | null {
  const key = `dimensoes_catalog:${planKey}`;
  const raw = meta.find((row) => row.key === key)?.value;
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as DetectedDimension[];
    if (Array.isArray(parsed) && parsed.length) return parsed.filter((item) => item.visible !== false);
  } catch {
    return null;
  }
  return null;
}

function planTesteReport(execucoes: Record<string, unknown>[], meta: Record<string, unknown>[]): {
  execucoes: number;
  grupos: number;
  sourceScope: number;
  gisin: boolean;
} {
  const rows = execucoes.filter((row) => row.plan_key === "PlanTeste") as unknown as ExecucaoRow[];
  const dims = catalogOf(meta, "PlanTeste") ?? inferDimensions(rows);
  const groups = groupExecucoesForReport(rows, dims);
  const blob = JSON.stringify(groups.map((group) => [group.frente, group.processo]));
  const raw = JSON.stringify(rows.map((row) => [row.frente, row.processo, row.suite_name, row.dimensions_json]));
  return {
    execucoes: rows.length,
    grupos: groups.length,
    sourceScope: rows.filter((row) => row.test_point_id != null).length,
    gisin: /GESIN|GERORJ/i.test(blob) || /GESIN|GERORJ/i.test(raw),
  };
}

export async function validateSqliteAgainstPostgres(): Promise<void> {
  const sqlite = new DatabaseSync(getDbPath(), { readOnly: true });
  const failures: string[] = [];
  try {
    for (const table of TABLES) {
      const left = sqliteRows(sqlite, `SELECT * FROM ${table}`);
      const right = await postgresRows(`SELECT * FROM ${table}`);
      if (left.length !== right.length) {
        failures.push(`${table}: sqlite=${left.length} postgres=${right.length}`);
        continue;
      }
      const order = table === "workbook_meta" ? "key" : table === "planejamento_linhas" ? "row_num" : "id";
      const sort = (rows: Record<string, unknown>[]) =>
        [...rows].sort((a, b) => String(a[order] ?? "").localeCompare(String(b[order] ?? ""), undefined, { numeric: true }));
      if (signature(sort(left)) !== signature(sort(right))) {
        failures.push(`${table}: ${left.length} linhas, conteúdo diferente`);
      }
    }

    const metaSqlite = sqliteRows(sqlite, "SELECT key, value FROM workbook_meta ORDER BY key");
    const metaPostgres = await postgresRows("SELECT key, value FROM workbook_meta ORDER BY key");
    const keys = new Set([...metaSqlite.map((row) => String(row.key)), ...metaPostgres.map((row) => String(row.key))]);
    for (const key of keys) {
      const left = metaSqlite.find((row) => row.key === key)?.value ?? null;
      const right = metaPostgres.find((row) => row.key === key)?.value ?? null;
      if (left !== right) failures.push(`workbook_meta chave diferente: ${key}`);
    }

    const plans = sqliteRows(sqlite, "SELECT plan_key, COUNT(*) AS n FROM execucoes GROUP BY plan_key ORDER BY plan_key");
    const plansPg = await postgresRows("SELECT plan_key, COUNT(*)::int AS n FROM execucoes GROUP BY plan_key ORDER BY plan_key");
    if (signature(plans) !== signature(plansPg)) failures.push("execuções por PlanKey divergentes");

    const bugs = sqliteRows(sqlite, "SELECT plan_key, COUNT(*) AS n FROM falhas GROUP BY plan_key ORDER BY plan_key");
    const bugsPg = await postgresRows("SELECT plan_key, COUNT(*)::int AS n FROM falhas GROUP BY plan_key ORDER BY plan_key");
    if (signature(bugs) !== signature(bugsPg)) failures.push("falhas por PlanKey divergentes");

    const revisions = sqliteRows(
      sqlite,
      `SELECT p.plan_key, r.version, r.reason, r.baseline_origin, r.scope_snapshot
       FROM planning_revision r JOIN planning p ON p.id = r.planning_id
       ORDER BY p.plan_key, r.version`,
    );
    const revisionsPg = await postgresRows(
      `SELECT p.plan_key, r.version, r.reason, r.baseline_origin, r.scope_snapshot
       FROM planning_revision r JOIN planning p ON p.id = r.planning_id
       ORDER BY p.plan_key, r.version`,
    );
    if (signature(revisions) !== signature(revisionsPg)) failures.push("revisions por PlanKey divergentes");

    for (const sql of [
      "SELECT revision_id, plan_id, suite_id, test_point_id, test_case_id, label FROM planning_scope_item ORDER BY id",
      "SELECT revision_id, suite_id, suite_name, planned_start, planned_end, baseline_quantity FROM planning_item ORDER BY id",
      "SELECT item_id, alloc_date, planned_quantity FROM planning_allocation ORDER BY id",
      "SELECT row_num, qa, prioridades, frente, processo, data_inicio, data_fim, replanejamento, qtd_cts_plan, cts_plan_dia, cts_cancelados FROM planejamento_linhas ORDER BY row_num",
    ]) {
      const left = sqliteRows(sqlite, sql);
      const right = await postgresRows(sql);
      if (signature(left) !== signature(right)) failures.push(`consulta divergente: ${sql.slice(0, 48)}`);
    }

    const execSqlite = sqliteRows(sqlite, "SELECT * FROM execucoes");
    const execPostgres = await postgresRows("SELECT * FROM execucoes");
    const leftPlan = planTesteReport(execSqlite, metaSqlite);
    const rightPlan = planTesteReport(execPostgres, metaPostgres);
    const expected = { execucoes: 60, grupos: 12, sourceScope: 60, gisin: false };
    if (JSON.stringify(leftPlan) !== JSON.stringify(expected)) {
      failures.push(`PlanTeste no SQLite: execuções=${leftPlan.execucoes} grupos=${leftPlan.grupos} sourceScope=${leftPlan.sourceScope} gisin=${leftPlan.gisin}`);
    }
    if (JSON.stringify(rightPlan) !== JSON.stringify(expected)) {
      failures.push(`PlanTeste no PostgreSQL: execuções=${rightPlan.execucoes} grupos=${rightPlan.grupos} sourceScope=${rightPlan.sourceScope} gisin=${rightPlan.gisin}`);
    }

    const sequences = await getPool().query<{ table_name: string; last_value: unknown; is_called: boolean }>(
      `SELECT sequencename AS table_name, last_value, is_called
       FROM pg_sequences
       WHERE schemaname = 'public' AND sequencename LIKE '%_id_seq'`,
    );
    for (const table of ["execucoes", "falhas", "planning", "planning_revision", "planning_scope_item", "planning_item", "planning_allocation"]) {
      const maxRow = await getPool().query<{ max: unknown }>(`SELECT MAX(id) AS max FROM ${table}`);
      const max = maxRow.rows[0]?.max == null ? 0 : asNumber(maxRow.rows[0].max);
      const seq = sequences.rows.find((row) => row.table_name === `${table}_id_seq`);
      const last = seq?.last_value == null ? 0 : asNumber(seq.last_value);
      const next = !seq || !seq.is_called ? last : last + 1;
      const expectedNext = max > 0 ? max + 1 : 1;
      if (next !== expectedNext) failures.push(`sequence ${table}: próximo=${next} esperado=${expectedNext}`);
    }
  } finally {
    sqlite.close();
  }
  if (failures.length) {
    throw new Error(failures.join("\n"));
  }
}
