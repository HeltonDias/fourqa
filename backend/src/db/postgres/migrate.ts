import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getPool } from "./pool.js";

const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "migrations");

/** Ordem fixa. 001 já pode estar aplicado no banco hospedado e não é reescrito. */
export const postgresMigrations: { version: number; file: string }[] = [
  { version: 1, file: path.join(migrationsDir, "001_baseline.sql") },
  { version: 2, file: path.join(migrationsDir, "002_plan_item_identity.sql") },
  { version: 3, file: path.join(migrationsDir, "003_plan_suite_fill.sql") },
];

export const POSTGRES_SCHEMA_VERSION = postgresMigrations[postgresMigrations.length - 1]?.version ?? 0;

const MISSING_SCHEMA = "Esquema PostgreSQL ausente. Rode db:postgres migrate antes de subir a API.";

export const APPLIED_VERSIONS_SQL = "SELECT version FROM schema_migrations ORDER BY version";

export type DbRows = { rows: Record<string, unknown>[] };
export type DbQuery = (sql: string, params?: unknown[]) => Promise<DbRows>;

export type IdentityConflict = {
  kind: "suite" | "point";
  revisionId: number;
  identity: number;
  count: number;
};

export type MigrationAssessment =
  | { status: "ok"; versions: number[]; pending: number[] }
  | { status: "invalid"; versions: number[]; message: string };

export function formatVersions(versions: readonly number[]): string {
  return `[${versions.join(",")}]`;
}

/** O histórico aplicado precisa ser um prefixo exato das migrations conhecidas. */
export function assessMigrationHistory(applied: readonly number[]): MigrationAssessment {
  const known = postgresMigrations.map((migration) => migration.version);
  const versions = [...applied].sort((a, b) => a - b);
  if (new Set(versions).size !== versions.length) {
    return {
      status: "invalid",
      versions,
      message: `Histórico de migrações inconsistente (${formatVersions(versions)}).`,
    };
  }
  const unknown = versions.filter((version) => !known.includes(version));
  if (unknown.length > 0) {
    return {
      status: "invalid",
      versions,
      message: `Histórico de migrações incompatível (versão ${unknown[0]} desconhecida).`,
    };
  }
  const prefix = known.slice(0, versions.length);
  const exact = versions.every((version, index) => version === prefix[index]);
  if (!exact) {
    return {
      status: "invalid",
      versions,
      message: `Histórico de migrações inconsistente (${formatVersions(versions)}).`,
    };
  }
  return { status: "ok", versions, pending: known.slice(versions.length) };
}

/** Pendências a partir de um prefixo já válido. Não detecta lacuna. */
export function pendingPostgresMigrations(currentVersion: number): number[] {
  return postgresMigrations.filter((migration) => migration.version > currentVersion).map((migration) => migration.version);
}

function errorCode(err: unknown): string {
  if (typeof err !== "object" || err === null || !("code" in err)) return "";
  const code = (err as { code: unknown }).code;
  return typeof code === "string" ? code : "";
}

export async function readAppliedVersions(query: DbQuery): Promise<number[] | "missing"> {
  try {
    const current = await query(APPLIED_VERSIONS_SQL);
    return current.rows.map((row) => Number(row.version));
  } catch (err) {
    if (errorCode(err) === "42P01") return "missing";
    throw err;
  }
}

export async function planningItemColumnNames(query: DbQuery): Promise<Set<string>> {
  const current = await query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'planning_item'`,
  );
  return new Set(current.rows.map((row) => String(row.column_name)));
}

export async function findPlanningIdentityConflicts(query: DbQuery, columns: ReadonlySet<string>): Promise<IdentityConflict[]> {
  const conflicts: IdentityConflict[] = [];
  if (!columns.has("suite_id")) return conflicts;
  const suites = await query(
    `SELECT revision_id, suite_id, COUNT(*)::int AS n
     FROM planning_item
     WHERE suite_id IS NOT NULL
     GROUP BY revision_id, suite_id
     HAVING COUNT(*) > 1`,
  );
  for (const row of suites.rows) {
    conflicts.push({
      kind: "suite",
      revisionId: Number(row.revision_id),
      identity: Number(row.suite_id),
      count: Number(row.n),
    });
  }
  if (!columns.has("test_point_id")) return conflicts;
  const points = await query(
    `SELECT revision_id, test_point_id, COUNT(*)::int AS n
     FROM planning_item
     WHERE suite_id IS NULL AND test_point_id IS NOT NULL
     GROUP BY revision_id, test_point_id
     HAVING COUNT(*) > 1`,
  );
  for (const row of points.rows) {
    conflicts.push({
      kind: "point",
      revisionId: Number(row.revision_id),
      identity: Number(row.test_point_id),
      count: Number(row.n),
    });
  }
  return conflicts;
}

export function identityConflictMessage(conflicts: readonly IdentityConflict[]): string {
  const lines = conflicts.slice(0, 20).map((conflict) =>
    conflict.kind === "suite"
      ? `suite revision_id=${conflict.revisionId} suite_id=${conflict.identity} count=${conflict.count}`
      : `point revision_id=${conflict.revisionId} test_point_id=${conflict.identity} count=${conflict.count}`,
  );
  const extra = conflicts.length > 20 ? `\ne mais ${conflicts.length - 20}` : "";
  return `Migração 002 bloqueada por ${conflicts.length} duplicidade(s).\n${lines.join("\n")}${extra}`;
}

async function poolQuery(sql: string, params: unknown[] = []): Promise<DbRows> {
  const result = await getPool().query(sql, params);
  return { rows: result.rows as Record<string, unknown>[] };
}

export async function assertPostgresSchema(): Promise<void> {
  const applied = await readAppliedVersions(poolQuery);
  if (applied === "missing" || applied.length === 0) throw new Error(MISSING_SCHEMA);
  const assessment = assessMigrationHistory(applied);
  if (assessment.status !== "ok") throw new Error(assessment.message);
  if (assessment.pending.length > 0) {
    const version = assessment.versions[assessment.versions.length - 1] ?? 0;
    throw new Error(`Esquema PostgreSQL incompatível (versão ${version}). Rode db:postgres migrate antes de subir a API.`);
  }
}

export async function migratePostgres(): Promise<void> {
  const pool = getPool();
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version integer PRIMARY KEY,
    applied_at text NOT NULL
  )`);
  const applied = await readAppliedVersions(poolQuery);
  if (applied === "missing") throw new Error(MISSING_SCHEMA);
  const assessment = assessMigrationHistory(applied);
  if (assessment.status !== "ok") throw new Error(assessment.message);
  const versions = assessment.versions;
  for (const migration of postgresMigrations) {
    if (versions.includes(migration.version)) continue;
    const expected = postgresMigrations[versions.length];
    if (!expected || expected.version !== migration.version) {
      throw new Error(`Histórico de migrações inconsistente (${formatVersions(versions)}).`);
    }
    if (migration.version === 2) {
      const columns = await planningItemColumnNames(poolQuery);
      const conflicts = await findPlanningIdentityConflicts(poolQuery, columns);
      if (conflicts.length > 0) throw new Error(identityConflictMessage(conflicts));
    }
    const sql = readFileSync(migration.file, "utf8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (version, applied_at) VALUES ($1, $2)", [
        migration.version,
        new Date().toISOString(),
      ]);
      await client.query("COMMIT");
      versions.push(migration.version);
    } catch (err) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* ignora falha de rollback */
      }
      throw err;
    } finally {
      client.release();
    }
  }
}
