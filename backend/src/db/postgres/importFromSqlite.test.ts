import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, it } from "node:test";
import { columnSelectList, DATA_TABLES, importSqliteIntoPostgres, type ImportPorts, type SqlQuery } from "./importFromSqlite.js";
import { expectedNextId, nextSequenceValue, validateSqliteAgainstPostgres } from "./validateEquivalence.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fourqa-import-"));
  tempDirs.push(dir);
  return dir;
}

function createSource(): string {
  const file = path.join(tempDir(), "origem.db");
  const db = new DatabaseSync(file);
  for (const table of DATA_TABLES) {
    db.exec(`CREATE TABLE ${table.name} (${table.columns.map((column) => `${column} TEXT`).join(", ")})`);
  }
  db.close();
  return file;
}

function exec(file: string, sql: string): void {
  const db = new DatabaseSync(file);
  db.exec(sql);
  db.close();
}

function fakePostgres(): { ports: ImportPorts; sql: string[]; rolledBack: boolean; migrated: boolean } {
  const store = new Map<string, Record<string, unknown>[]>(DATA_TABLES.map((table) => [table.name, []]));
  const sql: string[] = [];
  const state = { rolledBack: false, migrated: false };
  const apply = (statement: string, params: unknown[] = [], draft: Map<string, Record<string, unknown>[]>) => {
    const match = /^INSERT INTO (\w+) \(([^)]+)\) VALUES /.exec(statement);
    if (!match) return;
    const columns = match[2]!.split(", ");
    const rows = draft.get(match[1]!)!;
    for (let offset = 0; offset < params.length; offset += columns.length) {
      const row: Record<string, unknown> = {};
      columns.forEach((column, index) => {
        row[column] = params[offset + index];
      });
      rows.push(row);
    }
  };
  const queryOf = (draft: Map<string, Record<string, unknown>[]>): SqlQuery => async (statement, params = []) => {
    sql.push(statement);
    if (statement.startsWith("LOCK") || statement.includes("setval")) return { rows: [] };
    if (statement.startsWith("INSERT")) {
      if (statement.includes("INSERT INTO planning_scope_item") && params.includes("orfao")) {
        throw new Error("violates foreign key constraint Key (revision_id)=(9) is not present");
      }
      apply(statement, params, draft);
      return { rows: [] };
    }
    const table = /FROM (\w+)/.exec(statement)?.[1] ?? "";
    const rows = draft.get(table) ?? [];
    if (statement.includes("COUNT(*)")) return { rows: [{ n: rows.length }] };
    if (statement.includes("MAX(id)")) {
      const ids = rows.map((row) => Number(row.id)).filter((id) => Number.isFinite(id));
      return { rows: [{ max: ids.length ? Math.max(...ids) : null }] };
    }
    return { rows: rows.map((row) => ({ ...row })) };
  };
  const ports: ImportPorts = {
    async migrate() {
      state.migrated = true;
    },
    async transaction(fn) {
      const draft = new Map([...store.entries()].map(([name, rows]) => [name, rows.map((row) => ({ ...row }))]));
      try {
        const value = await fn(queryOf(draft));
        for (const [name, rows] of draft) store.set(name, rows);
        return value;
      } catch (err) {
        state.rolledBack = true;
        throw err;
      }
    },
  };
  return { ports, sql, get rolledBack() { return state.rolledBack; }, get migrated() { return state.migrated; } };
}

describe("importação SQLite", () => {
  it("não migra nem abre o Postgres se a origem não existe", async () => {
    const pg = fakePostgres();
    await assert.rejects(
      () => importSqliteIntoPostgres(path.join(tempDir(), "ausente.db"), pg.ports),
      /Arquivo SQLite de origem não encontrado/,
    );
    assert.equal(pg.migrated, false);
  });

  it("importa em transação, repete sem duplicar e não altera a origem", async () => {
    const file = createSource();
    exec(file, "INSERT INTO workbook_meta (key, value) VALUES ('chave', 'valor')");
    exec(file, "INSERT INTO planning (id, plan_key, created_at) VALUES ('4', 'Outro', '2026-01-01')");
    const before = fs.statSync(file).size;
    const pg = fakePostgres();
    const first = await importSqliteIntoPostgres(file, pg.ports);
    const second = await importSqliteIntoPostgres(file, pg.ports);
    assert.equal(first.status, "imported");
    assert.equal(second.status, "already-matched");
    assert.equal(pg.sql.filter((statement) => statement.startsWith("INSERT")).length, 2);
    assert.equal(pg.sql.some((statement) => /DELETE|TRUNCATE|DROP|UPDATE /i.test(statement)), false);
    assert.equal(fs.statSync(file).size, before);
    assert.equal(first.sequences.find((item) => item.table === "planning")?.nextId, 5);
  });

  it("recusa contagens divergentes sem inserir", async () => {
    const file = createSource();
    exec(file, "INSERT INTO falhas (id, titulo) VALUES ('1', 'uma')");
    const pg = fakePostgres();
    await importSqliteIntoPostgres(file, pg.ports);
    exec(file, "INSERT INTO falhas (id, titulo) VALUES ('2', 'duas')");
    await assert.rejects(() => importSqliteIntoPostgres(file, pg.ports), /Contagens divergentes: falhas sqlite=2 postgres=1/);
    assert.equal(pg.sql.filter((statement) => statement.startsWith("INSERT INTO falhas")).length, 1);
  });

  it("recusa contagem igual com conteúdo diferente sem gravar linhas", async () => {
    const file = createSource();
    exec(file, "INSERT INTO workbook_meta (key, value) VALUES ('chave', 'origem-secreta')");
    const pg = fakePostgres();
    await importSqliteIntoPostgres(file, pg.ports);
    exec(file, "UPDATE workbook_meta SET value = 'destino-secreta' WHERE key = 'chave'");
    const beforeWrites = pg.sql.length;
    await assert.rejects(() => importSqliteIntoPostgres(file, pg.ports), (err: unknown) => {
      const message = err instanceof Error ? err.message : "";
      assert.equal(message, "Migração interrompida sem apagar dados. Conteúdo divergente: workbook_meta");
      assert.equal(message.includes("origem-secreta") || message.includes("destino-secreta"), false);
      return true;
    });
    assert.equal(pg.rolledBack, true);
    assert.equal(pg.sql.slice(beforeWrites).some((statement) => statement.startsWith("INSERT")), false);
  });

  it("desfaz a transação quando um vínculo quebra e oculta o identificador", async () => {
    const file = createSource();
    exec(file, "INSERT INTO planning_scope_item (id, revision_id, label) VALUES ('1', 'orfao', 'item')");
    const pg = fakePostgres();
    await assert.rejects(() => importSqliteIntoPostgres(file, pg.ports), (err: unknown) => {
      const message = err instanceof Error ? err.message : "";
      assert.equal(message.includes("(9)"), false);
      assert.equal(message.includes("Key=(oculto)"), true);
      return true;
    });
    assert.equal(pg.rolledBack, true);
    assert.equal(pg.sql.some((statement) => /DELETE|TRUNCATE/i.test(statement)), false);
  });

  it("valida equivalência sem o fixture PlanTeste e sem ecoar valores", async () => {
    const file = createSource();
    exec(file, "INSERT INTO execucoes (id, plan_key) VALUES ('1', 'Outro')");
    exec(file, "INSERT INTO workbook_meta (key, value) VALUES ('chave', 'segredo-origem')");
    const db = new DatabaseSync(file, { readOnly: true });
    const mirror = async (sql: string, params: unknown[] = []) => {
      if (sql.includes("pg_get_serial_sequence")) {
        return { rows: [{ seq: `public.${String(params[0])}_id_seq` }] };
      }
      const sequence = /SELECT last_value, is_called FROM "public"\."([a-z0-9_]+)"/.exec(sql);
      if (sequence) {
        const table = sequence[1]!.replace(/_id_seq$/, "");
        const max = (db.prepare(`SELECT MAX(id) AS max FROM ${table}`).get() as { max: unknown }).max;
        const highest = max == null ? 0 : Number(max);
        return { rows: [{ last_value: highest > 0 ? highest : 1, is_called: highest > 0 }] };
      }
      return { rows: db.prepare(sql.replace(/::int/g, "")).all() as Record<string, unknown>[] };
    };
    await validateSqliteAgainstPostgres(file, mirror);
    await assert.rejects(
      () =>
        validateSqliteAgainstPostgres(file, async (sql, params) => {
          const result = await mirror(sql, params);
          if (sql.includes("FROM workbook_meta") && sql.includes("SELECT *")) {
            return { rows: result.rows.map((row) => ({ ...row, value: "outro-segredo" })) };
          }
          return result;
        }),
      (err: unknown) => {
        const message = err instanceof Error ? err.message : "";
        assert.equal(message.includes("segredo"), false);
        assert.equal(message.includes("conteúdo diferente"), true);
        return true;
      },
    );
    db.close();
    const source = fs.readFileSync(new URL("./validateEquivalence.ts", import.meta.url), "utf8");
    assert.equal(source.includes("PlanTeste"), false);
    assert.equal(source.includes("FROM pg_sequences"), false);
  });

  it("copia a identidade do item e um backup antigo entra nulo", async () => {
    assert.equal(
      columnSelectList(new Set(["id", "suite_id"]), ["id", "suite_id", "test_point_id"]),
      "id, suite_id, NULL AS test_point_id",
    );
    const capture = async (file: string) => {
      let params: unknown[] = [];
      const ports: ImportPorts = {
        async migrate() {},
        async transaction(fn) {
          return fn(async (statement, values = []) => {
            if (statement.startsWith("INSERT INTO planning_item")) params = values;
            if (statement.startsWith("LOCK") || statement.includes("setval")) return { rows: [] };
            if (statement.includes("COUNT(*)")) return { rows: [{ n: 0 }] };
            if (statement.includes("MAX(id)")) return { rows: [{ max: null }] };
            return { rows: [] };
          });
        },
      };
      await importSqliteIntoPostgres(file, ports);
      return params;
    };
    const current = createSource();
    exec(
      current,
      `INSERT INTO planning_item
        (id, revision_id, suite_id, suite_name, test_point_id, test_case_id, planned_start, planned_end, baseline_quantity)
       VALUES ('1', '2', NULL, NULL, '300', '900', '2026-10-03', NULL, '1')`,
    );
    assert.deepEqual((await capture(current)).slice(4, 6), ["300", "900"]);

    const old = createSource();
    const db = new DatabaseSync(old);
    db.exec("DROP TABLE planning_item");
    db.exec(
      `CREATE TABLE planning_item (
        id TEXT, revision_id TEXT, suite_id TEXT, suite_name TEXT,
        planned_start TEXT, planned_end TEXT, baseline_quantity TEXT
      )`,
    );
    db.exec("INSERT INTO planning_item (id, revision_id, suite_id, planned_start) VALUES ('1', '2', '10', '2026-10-01')");
    db.close();
    assert.deepEqual((await capture(old)).slice(4, 6), [null, null]);
  });

  it("distingue sequência vazia, avançada e colisão", async () => {
    assert.equal(nextSequenceValue(1, false), expectedNextId(null));
    assert.equal(nextSequenceValue(7715, true), expectedNextId(7715));
    assert.notEqual(nextSequenceValue(10, true), expectedNextId(12));
    const file = createSource();
    exec(file, "INSERT INTO execucoes (id, plan_key) VALUES ('12', 'Outro')");
    const db = new DatabaseSync(file, { readOnly: true });
    try {
      await assert.rejects(
        () =>
          validateSqliteAgainstPostgres(file, async (sql, params = []) => {
            if (sql.includes("pg_get_serial_sequence")) return { rows: [{ seq: `public.${String(params[0])}_id_seq` }] };
            if (sql.includes("last_value")) return { rows: [{ last_value: 10, is_called: true }] };
            if (sql.includes("pg_sequences")) return { rows: [] };
            return { rows: db.prepare(sql.replace(/::int/g, "")).all() as Record<string, unknown>[] };
          }),
        (err: unknown) => {
          const message = err instanceof Error ? err.message : "";
          assert.equal(message.includes("sequence execucoes: próximo=11 esperado=13"), true);
          assert.equal(message.includes("postgresql://"), false);
          return true;
        },
      );
    } finally {
      db.close();
    }
  });
});
