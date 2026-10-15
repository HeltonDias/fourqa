import { getPool } from "./pool.js";
import {
  assessMigrationHistory,
  findPlanningIdentityConflicts,
  formatVersions,
  planningItemColumnNames,
  POSTGRES_SCHEMA_VERSION,
  readAppliedVersions,
  type DbQuery,
  type IdentityConflict,
} from "./migrate.js";

export const EXPECTED_TABLES = [
  "workbook_meta",
  "planejamento_linhas",
  "execucoes",
  "falhas",
  "planning",
  "planning_revision",
  "planning_item",
  "planning_scope_item",
  "planning_allocation",
  "schema_migrations",
] as const;

const FILL_COLUMNS = ["responsavel", "prioridade"] as const;
const IDENTITY_COLUMNS = ["test_point_id", "test_case_id"] as const;
const IDENTITY_INDEXES = ["uq_plan_item_suite", "uq_plan_item_point"] as const;

const REQUIRED_FOREIGN_KEYS: { table: string; needle: string }[] = [
  { table: "planning_revision", needle: "REFERENCES planning(id)" },
  { table: "planning_item", needle: "REFERENCES planning_revision(id)" },
  { table: "planning_scope_item", needle: "REFERENCES planning_revision(id)" },
  { table: "planning_allocation", needle: "REFERENCES planning_item(id)" },
];

const REQUIRED_UNIQUES: { table: string; needle: string }[] = [
  { table: "planning", needle: "UNIQUE (plan_key)" },
  { table: "planning_revision", needle: "UNIQUE (planning_id, version)" },
  { table: "planning_allocation", needle: "UNIQUE (item_id, alloc_date)" },
];

export type PreflightReport = {
  precheck: "PASS" | "FAIL";
  versions: number[] | null;
  expected: number;
  pending: number[];
  historyMessage: string | null;
  planningItemColumns: string[];
  indexes: string[];
  suiteConflicts: IdentityConflict[];
  pointConflicts: IdentityConflict[];
  counts: Record<string, number | "ausente">;
  failReasons: string[];
};

export type VerifyReport = {
  verify: "PASS" | "FAIL";
  versions: number[];
  pending: number[];
  problems: string[];
};

function constraintText(value: string): string {
  return value.replace(/\s+/g, " ").trim().toUpperCase();
}

async function tableNames(query: DbQuery): Promise<Set<string>> {
  const current = await query(`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`);
  return new Set(current.rows.map((row) => String(row.tablename)));
}

async function indexNames(query: DbQuery): Promise<string[]> {
  const current = await query(
    `SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'planning_item' ORDER BY indexname`,
  );
  return current.rows.map((row) => String(row.indexname));
}

async function constraintDefs(query: DbQuery): Promise<{ table: string; def: string; type: string }[]> {
  const current = await query(
    `SELECT rel.relname AS table_name, c.contype AS contype, pg_get_constraintdef(c.oid) AS def
     FROM pg_constraint c
     JOIN pg_class rel ON rel.oid = c.conrelid
     JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
     WHERE nsp.nspname = 'public' AND c.contype IN ('f', 'u', 'p')`,
  );
  return current.rows.map((row) => ({
    table: String(row.table_name),
    def: String(row.def),
    type: String(row.contype),
  }));
}

async function optionalQuery(query: DbQuery, sql: string): Promise<boolean> {
  await query("SAVEPOINT schema_audit");
  try {
    await query(sql);
    await query("RELEASE SAVEPOINT schema_audit");
    return true;
  } catch {
    await query("ROLLBACK TO SAVEPOINT schema_audit");
    return false;
  }
}

export async function inspectPreflight(query: DbQuery): Promise<PreflightReport> {
  const failReasons: string[] = [];
  const tables = await tableNames(query);
  const versions = tables.has("schema_migrations") ? await readAppliedVersions(query) : "missing";
  const applied = versions === "missing" ? null : versions;
  const fresh = assessMigrationHistory([]);
  let pending = fresh.status === "ok" ? fresh.pending : [];
  let historyMessage: string | null = null;
  if (applied) {
    const assessment = assessMigrationHistory(applied);
    if (assessment.status === "ok") pending = assessment.pending;
    else {
      pending = [];
      historyMessage = assessment.message;
      failReasons.push(assessment.message);
    }
  }
  const columns = tables.has("planning_item") ? await planningItemColumnNames(query) : new Set<string>();
  const conflicts = tables.has("planning_item") ? await findPlanningIdentityConflicts(query, columns) : [];
  const suiteConflicts = conflicts.filter((conflict) => conflict.kind === "suite");
  const pointConflicts = conflicts.filter((conflict) => conflict.kind === "point");
  if (suiteConflicts.length > 0) failReasons.push(`${suiteConflicts.length} duplicidade(s) de suíte`);
  if (pointConflicts.length > 0) failReasons.push(`${pointConflicts.length} duplicidade(s) de Test Point`);
  const counts: Record<string, number | "ausente"> = {};
  for (const table of EXPECTED_TABLES) {
    if (!tables.has(table)) {
      counts[table] = "ausente";
      continue;
    }
    const current = await query(`SELECT COUNT(*)::int AS n FROM ${table}`);
    counts[table] = Number(current.rows[0]?.n ?? 0);
  }
  return {
    precheck: failReasons.length > 0 ? "FAIL" : "PASS",
    versions: applied,
    expected: POSTGRES_SCHEMA_VERSION,
    pending,
    historyMessage,
    planningItemColumns: [...columns].sort(),
    indexes: tables.has("planning_item") ? await indexNames(query) : [],
    suiteConflicts,
    pointConflicts,
    counts,
    failReasons,
  };
}

function hasConstraint(
  constraints: { table: string; def: string; type: string }[],
  table: string,
  needle: string,
): boolean {
  const wanted = constraintText(needle);
  return constraints.some((constraint) => constraint.table === table && constraintText(constraint.def).includes(wanted));
}

export async function inspectVerify(query: DbQuery): Promise<VerifyReport> {
  const problems: string[] = [];
  const tables = await tableNames(query);
  const read = tables.has("schema_migrations") ? await readAppliedVersions(query) : "missing";
  const versions = read === "missing" ? [] : read;
  const assessment = assessMigrationHistory(versions);
  const pending = assessment.status === "ok" ? assessment.pending : [];
  if (assessment.status !== "ok" || formatVersions(versions) !== "[1,2,3]" || pending.length > 0) {
    problems.push(assessment.status === "ok" ? `histórico ${formatVersions(versions)}` : assessment.message);
  }
  for (const table of EXPECTED_TABLES) {
    if (!tables.has(table)) problems.push(`tabela ausente: ${table}`);
  }
  const columns = tables.has("planning_item") ? await planningItemColumnNames(query) : new Set<string>();
  for (const column of [...IDENTITY_COLUMNS, ...FILL_COLUMNS]) {
    if (!columns.has(column)) problems.push(`coluna ausente: planning_item.${column}`);
  }
  const indexes = tables.has("planning_item") ? await indexNames(query) : [];
  for (const index of IDENTITY_INDEXES) {
    if (!indexes.includes(index)) problems.push(`índice ausente: ${index}`);
  }
  const constraints = await constraintDefs(query);
  for (const rule of [...REQUIRED_FOREIGN_KEYS, ...REQUIRED_UNIQUES]) {
    if (!hasConstraint(constraints, rule.table, rule.needle)) problems.push(`constraint ausente: ${rule.table} ${rule.needle}`);
  }
  for (const table of EXPECTED_TABLES) {
    if (!constraints.some((constraint) => constraint.table === table && constraint.type === "p")) {
      problems.push(`chave primária ausente: ${table}`);
    }
  }
  const probes = [
    `SELECT id, suite_id, suite_name, test_point_id, test_case_id, planned_start, planned_end, baseline_quantity, responsavel, prioridade FROM planning_item WHERE revision_id = -1`,
    `SELECT id FROM execucoes WHERE false`,
    `SELECT id FROM falhas WHERE false`,
    `SELECT row_num FROM planejamento_linhas WHERE false`,
    `SELECT key FROM workbook_meta WHERE false`,
  ];
  for (const sql of probes) {
    const ok = await optionalQuery(query, sql);
    if (!ok) problems.push(`consulta de schema falhou: ${sql.split(" FROM ")[1]?.split(" ")[0] ?? "tabela"}`);
  }
  return { verify: problems.length > 0 ? "FAIL" : "PASS", versions, pending, problems };
}

function conflictLines(conflicts: readonly IdentityConflict[]): string[] {
  return conflicts.map((conflict) =>
    conflict.kind === "suite"
      ? `suite_conflict revision_id=${conflict.revisionId} suite_id=${conflict.identity} count=${conflict.count}`
      : `point_conflict revision_id=${conflict.revisionId} test_point_id=${conflict.identity} count=${conflict.count}`,
  );
}

export function formatPreflight(report: PreflightReport): string {
  const present = (name: string) => (report.planningItemColumns.includes(name) ? "presente" : "ausente");
  const lines = [
    `PRECHECK = ${report.precheck}`,
    `versions = ${report.versions ? formatVersions(report.versions) : "ausente"}`,
    `expected = ${report.expected}`,
    `pending = ${formatVersions(report.pending)}`,
    `history = ${report.historyMessage ?? "ok"}`,
    `planning_item = ${report.planningItemColumns.join(", ") || "ausente"}`,
    `test_point_id = ${present("test_point_id")}`,
    `test_case_id = ${present("test_case_id")}`,
    `responsavel = ${present("responsavel")}`,
    `prioridade = ${present("prioridade")}`,
    `uq_plan_item_suite = ${report.indexes.includes("uq_plan_item_suite") ? "presente" : "ausente"}`,
    `uq_plan_item_point = ${report.indexes.includes("uq_plan_item_point") ? "presente" : "ausente"}`,
    `planning_indexes = ${report.indexes.join(", ") || "nenhum"}`,
    `suite_conflicts = ${report.suiteConflicts.length}`,
    `point_conflicts = ${report.pointConflicts.length}`,
    ...conflictLines(report.suiteConflicts),
    ...conflictLines(report.pointConflicts),
    ...EXPECTED_TABLES.map((table) => `count ${table} = ${report.counts[table] ?? "ausente"}`),
  ];
  if (report.failReasons.length > 0) lines.push(`fail = ${report.failReasons.join("; ")}`);
  return lines.join("\n");
}

export function formatVerify(report: VerifyReport): string {
  const lines = [
    `VERIFY = ${report.verify}`,
    `versions = ${formatVersions(report.versions)}`,
    `pending = ${formatVersions(report.pending)}`,
  ];
  if (report.problems.length === 0) lines.push("problems = nenhum");
  else for (const problem of report.problems) lines.push(`problem = ${problem}`);
  return lines.join("\n");
}

async function withReadOnly<T>(fn: (query: DbQuery) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN READ ONLY");
    const value = await fn(async (sql, params = []) => {
      const result = await client.query(sql, params);
      return { rows: result.rows as Record<string, unknown>[] };
    });
    await client.query("COMMIT");
    return value;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* a transação pode já ter sido encerrada */
    }
    throw err;
  } finally {
    client.release();
  }
}

export function runPreflight(): Promise<PreflightReport> {
  return withReadOnly(inspectPreflight);
}

export function runVerify(): Promise<VerifyReport> {
  return withReadOnly(inspectVerify);
}
