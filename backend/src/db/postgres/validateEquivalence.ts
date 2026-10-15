import { DatabaseSync } from "node:sqlite";
import { asNumber, getPool } from "./pool.js";
import { columnSelectList, resolveSqliteSource } from "./importFromSqlite.js";
import { sameContent, sanitizeMigrationError, stable } from "./tableSignature.js";

const IDENTITY_TABLES = [
  "execucoes",
  "falhas",
  "planning",
  "planning_revision",
  "planning_scope_item",
  "planning_item",
  "planning_allocation",
] as const;

/** Próximo nextval. is_called falso devolve o próprio last_value; verdadeiro soma 1. */
export function nextSequenceValue(lastValue: unknown, isCalled: unknown): number {
  const last = lastValue == null ? 0 : asNumber(lastValue);
  const called = isCalled === true || isCalled === 1 || isCalled === "t" || isCalled === "true";
  return called ? last + 1 : last;
}

export function expectedNextId(maxId: unknown): number {
  if (maxId == null) return 1;
  const max = asNumber(maxId);
  return max > 0 ? max + 1 : 1;
}

function quoteSequence(name: string): string {
  const parts = name.split(".");
  if (parts.length === 0 || parts.some((part) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(part))) {
    throw new Error("sequence inválida");
  }
  return parts.map((part) => `"${part}"`).join(".");
}

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

function signature(rows: Record<string, unknown>[]): string {
  return JSON.stringify(rows.map((row) => stable(row)));
}

function equivalent(left: Record<string, unknown>[], right: Record<string, unknown>[], columns: string[], order: string): boolean {
  return sameContent(left, right, columns, order);
}

function sqliteRows(db: DatabaseSync, sql: string): Record<string, unknown>[] {
  return db.prepare(sql).all() as Record<string, unknown>[];
}

export async function validateSqliteAgainstPostgres(
  sourcePath?: string,
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> = async (sql, params = []) => {
    const result = await getPool().query<Record<string, unknown>>(sql, params);
    return { rows: result.rows };
  },
): Promise<void> {
  const sqlite = new DatabaseSync(resolveSqliteSource(sourcePath), { readOnly: true });
  const failures: string[] = [];
  try {
    try {
    for (const table of TABLES) {
      const left = sqliteRows(sqlite, `SELECT * FROM ${table}`);
      const right = (await query(`SELECT * FROM ${table}`)).rows;
      if (left.length !== right.length) {
        failures.push(`${table}: sqlite=${left.length} postgres=${right.length}`);
        continue;
      }
      const order = table === "workbook_meta" ? "key" : table === "planejamento_linhas" ? "row_num" : "id";
      const columns = left[0] ? Object.keys(left[0]) : right[0] ? Object.keys(right[0]) : [];
      if (!equivalent(left, right, columns, order)) {
        failures.push(`${table}: ${left.length} linhas, conteúdo diferente`);
      }
    }

    const plans = sqliteRows(sqlite, "SELECT plan_key, COUNT(*) AS n FROM execucoes GROUP BY plan_key ORDER BY plan_key");
    const plansPg = (await query("SELECT plan_key, COUNT(*)::int AS n FROM execucoes GROUP BY plan_key ORDER BY plan_key")).rows;
    if (signature(plans) !== signature(plansPg)) failures.push("execuções por PlanKey divergentes");

    const bugs = sqliteRows(sqlite, "SELECT plan_key, COUNT(*) AS n FROM falhas GROUP BY plan_key ORDER BY plan_key");
    const bugsPg = (await query("SELECT plan_key, COUNT(*)::int AS n FROM falhas GROUP BY plan_key ORDER BY plan_key")).rows;
    if (signature(bugs) !== signature(bugsPg)) failures.push("falhas por PlanKey divergentes");

    const revisions = sqliteRows(
      sqlite,
      `SELECT p.plan_key, r.version, r.reason, r.baseline_origin, r.scope_snapshot
       FROM planning_revision r JOIN planning p ON p.id = r.planning_id
       ORDER BY p.plan_key, r.version`,
    );
    const revisionsPg = (
      await query(
        `SELECT p.plan_key, r.version, r.reason, r.baseline_origin, r.scope_snapshot
       FROM planning_revision r JOIN planning p ON p.id = r.planning_id
       ORDER BY p.plan_key, r.version`,
      )
    ).rows;
    if (signature(revisions) !== signature(revisionsPg)) failures.push("revisions por PlanKey divergentes");

    const itemColumns = [
      "revision_id", "suite_id", "suite_name", "test_point_id", "test_case_id",
      "planned_start", "planned_end", "baseline_quantity", "responsavel", "prioridade",
    ];
    const itemPresent = new Set(
      (sqlite.prepare("PRAGMA table_info(planning_item)").all() as { name: string }[]).map((column) => column.name),
    );
    const compared = [
      {
        sqliteSql: "SELECT revision_id, plan_id, suite_id, test_point_id, test_case_id, label FROM planning_scope_item ORDER BY id",
        pgSql: "SELECT revision_id, plan_id, suite_id, test_point_id, test_case_id, label FROM planning_scope_item ORDER BY id",
      },
      {
        sqliteSql: `SELECT ${columnSelectList(itemPresent, itemColumns)} FROM planning_item ORDER BY id`,
        pgSql: `SELECT ${itemColumns.join(", ")} FROM planning_item ORDER BY id`,
      },
      {
        sqliteSql: "SELECT item_id, alloc_date, planned_quantity FROM planning_allocation ORDER BY id",
        pgSql: "SELECT item_id, alloc_date, planned_quantity FROM planning_allocation ORDER BY id",
      },
      {
        sqliteSql: "SELECT row_num, qa, prioridades, frente, processo, data_inicio, data_fim, replanejamento, qtd_cts_plan, cts_plan_dia, cts_cancelados FROM planejamento_linhas ORDER BY row_num",
        pgSql: "SELECT row_num, qa, prioridades, frente, processo, data_inicio, data_fim, replanejamento, qtd_cts_plan, cts_plan_dia, cts_cancelados FROM planejamento_linhas ORDER BY row_num",
      },
    ];
    for (const pair of compared) {
      const left = sqliteRows(sqlite, pair.sqliteSql);
      const right = (await query(pair.pgSql)).rows;
      if (signature(left) !== signature(right)) failures.push(`consulta divergente: ${pair.pgSql.slice(0, 48)}`);
    }

    for (const table of IDENTITY_TABLES) {
      const maxRow = await query(`SELECT MAX(id) AS max FROM ${table}`);
      const found = await query("SELECT pg_get_serial_sequence($1, 'id') AS seq", [table]);
      const seqName = found.rows[0]?.seq;
      if (typeof seqName !== "string" || seqName.trim() === "") {
        failures.push(`sequence ${table}: ausente`);
        continue;
      }
      const state = await query(`SELECT last_value, is_called FROM ${quoteSequence(seqName)}`);
      const row = state.rows[0];
      if (!row) {
        failures.push(`sequence ${table}: ausente`);
        continue;
      }
      const next = nextSequenceValue(row.last_value, row.is_called);
      const expectedNext = expectedNextId(maxRow.rows[0]?.max);
      if (next !== expectedNext) failures.push(`sequence ${table}: próximo=${next} esperado=${expectedNext}`);
    }
    } catch (err) {
      throw sanitizeMigrationError(err);
    }
  } finally {
    sqlite.close();
  }
  if (failures.length) throw sanitizeMigrationError(new Error(failures.join("\n")));
}
