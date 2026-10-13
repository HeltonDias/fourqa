import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { getDb } from "../db.js";
import { sqliteMetaStore } from "./sqliteMetaStore.js";
import { sqliteLegacyPlanStore } from "./sqliteLegacyPlanStore.js";

const dir = mkdtempSync(path.join(tmpdir(), "fourqa-legacy-plan-"));
process.env.FOURQA_DB = path.join(dir, "fourqa.db");

describe("sqliteLegacyPlanStore", { concurrency: 1 }, () => {
  after(() => {
    getDb().close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("tabela vazia retorna []", () => {
    assert.deepEqual(sqliteLegacyPlanStore.listBase(), []);
  });

  it("retorna todas as linhas em ordem de row_num, inclusive totais", () => {
    const db = getDb();
    const insert = db.prepare(
      `INSERT INTO planejamento_linhas
        (row_num, qa, prioridades, frente, processo, data_inicio, data_fim, replanejamento, qtd_cts_plan, cts_plan_dia, cts_cancelados)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    insert.run(3, null, null, null, "Valores Totais >>>>>>>", null, null, null, 91, null, null);
    insert.run(1, null, null, null, null, null, null, null, null, null, null);
    insert.run(2, "QA 1", "P1", "GESIN", "Cadastro", "2026-10-12", "2026-11-12", 7.5, 99, 1.25, 4);
    sqliteMetaStore.set("planejamento_legado_plan_key", "OutroPlano");

    const rows = sqliteLegacyPlanStore.listBase();
    assert.deepEqual(rows.map((row) => row.row_num), [1, 2, 3]);
    assert.equal(rows.some((row) => row.processo === "Valores Totais >>>>>>>"), true);
    assert.equal(rows.length, 3);
  });

  it("preserva nulos", () => {
    const row = sqliteLegacyPlanStore.listBase().find((item) => item.row_num === 1);
    assert.equal(row?.qa, null);
    assert.equal(row?.prioridades, null);
    assert.equal(row?.frente, null);
    assert.equal(row?.processo, null);
    assert.equal(row?.data_inicio, null);
    assert.equal(row?.data_fim, null);
    assert.equal(row?.replanejamento, null);
    assert.equal(row?.qtd_cts_plan, null);
    assert.equal(row?.cts_plan_dia, null);
    assert.equal(row?.cts_cancelados, null);
  });

  it("preserva strings e números como foram armazenados", () => {
    const row = sqliteLegacyPlanStore.listBase().find((item) => item.row_num === 2);
    assert.equal(row?.qa, "QA 1");
    assert.equal(row?.prioridades, "P1");
    assert.equal(row?.frente, "GESIN");
    assert.equal(row?.processo, "Cadastro");
    assert.equal(row?.data_inicio, "2026-10-12");
    assert.equal(row?.data_fim, "2026-11-12");
    assert.equal(row?.replanejamento, 7.5);
    assert.equal(row?.qtd_cts_plan, 99);
    assert.equal(row?.cts_plan_dia, 1.25);
    assert.equal(row?.cts_cancelados, 4);
  });

  it("não filtra Valores Totais nem aplica o dono do legado", () => {
    const rows = sqliteLegacyPlanStore.listBase();
    assert.equal(rows.filter((row) => /valores\s+totais/i.test(row.processo ?? "")).length, 1);
    assert.equal(rows.length, 3);
  });
});
