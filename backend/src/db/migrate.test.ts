import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { describe, it } from "node:test";
import { migrate, SCHEMA_VERSION, schemaVersion } from "./migrate.js";

describe("migrate", () => {
  it("sobe um banco vazio até a versão atual e pode rodar de novo", () => {
    const db = new DatabaseSync(":memory:");
    migrate(db);
    assert.equal(schemaVersion(db), SCHEMA_VERSION);
    const cols = db.prepare("PRAGMA table_info(execucoes)").all() as { name: string }[];
    assert.ok(cols.some((c) => c.name === "dimensions_json"));
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[];
    assert.ok(tables.some((t) => t.name === "planning_allocation"));
    migrate(db);
    assert.equal(schemaVersion(db), SCHEMA_VERSION);
  });

  it("acrescenta colunas num banco que já tinha as tabelas da importação legada", () => {
    const db = new DatabaseSync(":memory:");
    db.exec("CREATE TABLE execucoes (id INTEGER PRIMARY KEY, plan_key TEXT)");
    db.exec("CREATE TABLE falhas (id INTEGER PRIMARY KEY)");
    db.exec("CREATE TABLE planejamento_linhas (row_num INTEGER PRIMARY KEY)");
    db.exec("CREATE TABLE workbook_meta (key TEXT PRIMARY KEY, value TEXT)");
    migrate(db);
    const cols = db.prepare("PRAGMA table_info(execucoes)").all() as { name: string }[];
    assert.ok(cols.some((c) => c.name === "suite_path"));
    assert.equal(schemaVersion(db), SCHEMA_VERSION);
  });
});