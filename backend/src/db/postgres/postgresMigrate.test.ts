import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, describe, it } from "node:test";
import { bindPostgresTestPool } from "./pool.js";
import {
  assessMigrationHistory,
  assertPostgresSchema,
  migratePostgres,
  pendingPostgresMigrations,
  POSTGRES_SCHEMA_VERSION,
  postgresMigrations,
} from "./migrate.js";

afterEach(() => {
  bindPostgresTestPool(null);
});

function poolReturning(versions: number[] | "missing" | Error) {
  bindPostgresTestPool({
    async query() {
      if (versions === "missing") {
        const err = new Error("relation schema_migrations does not exist") as Error & { code: string };
        err.code = "42P01";
        throw err;
      }
      if (versions instanceof Error) throw versions;
      return { rows: versions.map((version) => ({ version })) };
    },
    async connect() {
      throw new Error("connect não usado na conferência");
    },
  });
}

function scriptedMigrations(initial: number[], options?: { failSql?: string; suiteConflicts?: boolean }) {
  const versions = [...initial];
  const log: string[] = [];
  let began = 0;
  const client = {
    async query(sql: string, params?: unknown[]) {
      log.push(sql);
      if (sql === "BEGIN") {
        began += 1;
        return { rows: [] };
      }
      if (sql === "ROLLBACK" || sql === "COMMIT") return { rows: [] };
      if (options?.failSql && sql.includes(options.failSql)) throw new Error("migration failed");
      if (sql.startsWith("INSERT INTO schema_migrations")) versions.push(Number(params?.[0]));
      return { rows: [] };
    },
    release() {},
  };
  bindPostgresTestPool({
    async query(sql: string) {
      log.push(sql);
      if (sql.includes("FROM schema_migrations")) return { rows: versions.map((version) => ({ version })) };
      if (sql.includes("information_schema.columns")) {
        return { rows: [{ column_name: "suite_id" }, { column_name: "test_point_id" }] };
      }
      if (sql.includes("suite_id IS NOT NULL") && options?.suiteConflicts) {
        return { rows: [{ revision_id: 4, suite_id: 10, n: 2 }] };
      }
      if (sql.includes("GROUP BY")) return { rows: [] };
      return { rows: [] };
    },
    async connect() {
      return client;
    },
  });
  return { versions, log, began: () => began };
}

describe("migrações PostgreSQL", () => {
  it("aplica 001 e depois 002, e não reaplica versão concluída", () => {
    assert.deepEqual(postgresMigrations.map((migration) => migration.version), [1, 2, 3]);
    assert.equal(POSTGRES_SCHEMA_VERSION, 3);
    assert.deepEqual(pendingPostgresMigrations(0), [1, 2, 3]);
    assert.deepEqual(pendingPostgresMigrations(1), [2, 3]);
    assert.deepEqual(pendingPostgresMigrations(2), [3]);
    assert.deepEqual(pendingPostgresMigrations(3), []);
    const baseline = readFileSync(postgresMigrations[0]!.file, "utf8");
    const identity = readFileSync(postgresMigrations[1]!.file, "utf8");
    const fill = readFileSync(postgresMigrations[2]!.file, "utf8");
    assert.equal(baseline.includes("uq_plan_item"), false);
    assert.match(identity, /ADD COLUMN IF NOT EXISTS test_point_id/);
    assert.equal(identity.includes("DROP"), false);
    assert.match(fill, /ADD COLUMN IF NOT EXISTS responsavel text/);
    assert.match(fill, /ADD COLUMN IF NOT EXISTS prioridade text/);
    assert.equal(fill.includes("NOT NULL"), false);
    assert.equal(/(^|\n)\s*DROP\b/i.test(fill), false);
    assert.equal(/(^|\n)\s*(ALTER|DROP|UPDATE|DELETE|INSERT|TRUNCATE)\b[^\n]*\b(execucoes|falhas)\b/i.test(fill), false);
  });

  it("exige prefixo íntegro e só aceita o schema final", async () => {
    const invalid = (applied: number[]) => {
      const assessment = assessMigrationHistory(applied);
      if (assessment.status !== "invalid") assert.fail(`histórico ${applied.join(",")} deveria falhar`);
      return assessment.message;
    };
    assert.equal(assessMigrationHistory([]).status, "ok");
    assert.equal(assessMigrationHistory([1, 2, 3]).status, "ok");
    assert.equal(assessMigrationHistory([3, 2, 1]).status, "ok");
    assert.match(invalid([1, 3]), /inconsistente \(\[1,3\]\)/);
    assert.match(invalid([2]), /inconsistente/);
    assert.match(invalid([2, 3]), /inconsistente/);
    assert.match(invalid([1, 2, 4]), /versão 4 desconhecida/);
    assert.match(invalid([1, 2, 3, 4]), /versão 4 desconhecida/);

    poolReturning("missing");
    await assert.rejects(() => assertPostgresSchema(), /Esquema PostgreSQL ausente/);
    poolReturning([]);
    await assert.rejects(() => assertPostgresSchema(), /Esquema PostgreSQL ausente/);
    poolReturning([1]);
    await assert.rejects(() => assertPostgresSchema(), /incompatível \(versão 1\)/);
    poolReturning([1, 2]);
    await assert.rejects(() => assertPostgresSchema(), /incompatível \(versão 2\)/);
    poolReturning([1, 3]);
    await assert.rejects(() => assertPostgresSchema(), /inconsistente \(\[1,3\]\)/);
    poolReturning([1, 2, 4]);
    await assert.rejects(() => assertPostgresSchema(), /versão 4 desconhecida/);
    poolReturning([1, 2, 3]);
    await assertPostgresSchema();
    poolReturning(new Error("connect ECONNREFUSED"));
    await assert.rejects(() => assertPostgresSchema(), /ECONNREFUSED/);
  });

  it("aplica o próximo arquivo em ordem e não reaplica o histórico pronto", async () => {
    const db = scriptedMigrations([]);
    await migratePostgres();
    assert.deepEqual(db.versions, [1, 2, 3]);
    const applies = db.began();
    await migratePostgres();
    assert.equal(db.began(), applies);
    assert.deepEqual(db.versions, [1, 2, 3]);
  });

  it("recusa lacuna e duplicidade sem aplicar a migration seguinte", async () => {
    const gap = scriptedMigrations([1, 3]);
    await assert.rejects(() => migratePostgres(), /inconsistente \(\[1,3\]\)/);
    assert.equal(gap.began(), 0);
    assert.deepEqual(gap.versions, [1, 3]);

    const conflict = scriptedMigrations([1], { suiteConflicts: true });
    await assert.rejects(() => migratePostgres(), /Migração 002 bloqueada/);
    assert.equal(conflict.began(), 0);
    assert.deepEqual(conflict.versions, [1]);
  });

  it("desfaz a migration que falha e preserva a anterior", async () => {
    const db = scriptedMigrations([], { failSql: "uq_plan_item_suite" });
    const fill = readFileSync(postgresMigrations[2]!.file, "utf8");
    await assert.rejects(() => migratePostgres(), /migration failed/);
    assert.deepEqual(db.versions, [1]);
    assert.equal(db.log.includes("ROLLBACK"), true);
    assert.equal(db.log.includes(fill), false);
  });
});
