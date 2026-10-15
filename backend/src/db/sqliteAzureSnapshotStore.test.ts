import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { getDb } from "../db.js";
import { sqliteMetaStore } from "./sqliteMetaStore.js";
import type { ExecucaoRow, FalhaRow } from "../types.js";
import { sqliteAzureSnapshotStore } from "./sqliteAzureSnapshotStore.js";

const dir = mkdtempSync(path.join(tmpdir(), "fourqa-azure-store-"));
process.env.FOURQA_DB = path.join(dir, "fourqa.db");

function exec(partial: Partial<Omit<ExecucaoRow, "id">>): Omit<ExecucaoRow, "id"> {
  return {
    plan_key: null,
    plan_id: null,
    plan_name: null,
    frente: null,
    atalho: null,
    processo: null,
    suite_id: null,
    suite_name: null,
    parent_suite_id: null,
    suite_depth: null,
    suite_path: null,
    dimensions_json: null,
    test_point_id: null,
    test_case_id: null,
    test_case_title: null,
    responsabilidade: null,
    test_case_state: null,
    test_point_state: null,
    outcome: null,
    date_completed: null,
    run_by: null,
    last_updated_date: null,
    last_test_run_id: null,
    last_result_id: null,
    test_case_link: null,
    case_priority: null,
    test_case_tags: null,
    ...partial,
  };
}

function falha(partial: Partial<Omit<FalhaRow, "id">>): Omit<FalhaRow, "id"> {
  return {
    plan_key: null,
    responsavel: null,
    ambiente: null,
    categoria: null,
    bug_id: null,
    impacto: null,
    frente: null,
    titulo: null,
    status: null,
    criacao: null,
    fechamento: null,
    links: null,
    tags: null,
    ...partial,
  };
}

describe("sqliteAzureSnapshotStore", { concurrency: 1 }, () => {
  before(() => {
    getDb();
    sqliteMetaStore.set("data_inicio", "2026-10-12");
    sqliteMetaStore.set("data_fim", "2026-11-12");
    sqliteMetaStore.set("cabecalho_titulo", "STATUS REPORT QA");
    sqliteMetaStore.set("planejamento_legado_plan_key", "LegadoA");
  });

  after(() => {
    getDb().close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("replaceSnapshot grava execuções, falhas e só as metas enviadas", () => {
    sqliteAzureSnapshotStore.replaceSnapshot({
      execucoes: [
        exec({ plan_key: "PlanoA", suite_name: "Cadastro", test_point_id: 1, test_case_title: "CT 1" }),
        exec({ plan_key: "PlanoA", suite_name: "Baixa", test_point_id: 2, test_case_title: "CT 2" }),
        exec({ plan_key: "PlanoB", suite_name: "Outro", test_point_id: 3, test_case_title: "CT 3" }),
      ],
      falhas: [
        falha({ plan_key: "PlanoA", bug_id: 10, titulo: "100% ok" }),
        falha({ plan_key: "PlanoA", bug_id: 11, titulo: "100_ok" }),
        falha({ plan_key: "PlanoA", bug_id: 12, titulo: "100Xok" }),
        falha({ plan_key: "PlanoB", bug_id: 20, titulo: "bug B" }),
      ],
      meta: {
        kpi_plan_key: "PlanoA",
        ultima_sincronizacao_azure: "2026-10-08T12:00:00.000Z",
      },
    });

    assert.equal(sqliteAzureSnapshotStore.listExecucoes("PlanoA").length, 2);
    assert.equal(sqliteAzureSnapshotStore.listFalhas("PlanoA").length, 3);
    assert.equal(sqliteMetaStore.get("kpi_plan_key"), "PlanoA");
    assert.equal(sqliteMetaStore.get("ultima_sincronizacao_azure"), "2026-10-08T12:00:00.000Z");
    assert.equal(sqliteMetaStore.get("data_inicio"), "2026-10-12");
    assert.equal(sqliteMetaStore.get("data_fim"), "2026-11-12");
    assert.equal(sqliteMetaStore.get("cabecalho_titulo"), "STATUS REPORT QA");
    assert.equal(sqliteMetaStore.get("planejamento_legado_plan_key"), "LegadoA");
  });

  it("listagens filtram PlanKey e a busca trata % e _ como texto", () => {
    const execA = sqliteAzureSnapshotStore.listExecucoes("PlanoA").map((row) => row.test_point_id);
    const execB = sqliteAzureSnapshotStore.listExecucoes("PlanoB").map((row) => row.test_point_id);
    assert.deepEqual(execA, [1, 2]);
    assert.deepEqual(execB, [3]);
    assert.deepEqual(
      sqliteAzureSnapshotStore.listFalhas("PlanoA").map((row) => row.bug_id),
      [10, 11, 12],
    );
    assert.deepEqual(
      sqliteAzureSnapshotStore.listFalhas("PlanoB").map((row) => row.bug_id),
      [20],
    );

    const found = sqliteAzureSnapshotStore.queryExecucoes({ planKey: "PlanoA", limit: 50, offset: 0, q: "cadastro" });
    assert.equal(found.total, 1);
    assert.equal(found.rows[0]?.suite_name, "Cadastro");

    const percent = sqliteAzureSnapshotStore.queryFalhas({ planKey: "PlanoA", limit: 50, offset: 0, q: "100%" });
    assert.deepEqual(percent.rows.map((row) => row.titulo), ["100% ok"]);

    const underscore = sqliteAzureSnapshotStore.queryFalhas({ planKey: "PlanoA", limit: 50, offset: 0, q: "100_" });
    assert.deepEqual(underscore.rows.map((row) => row.titulo), ["100_ok"]);
  });

  it("query mantém paginação, total e ORDER BY id", () => {
    const page = sqliteAzureSnapshotStore.queryExecucoes({ planKey: "PlanoA", limit: 1, offset: 0, q: "" });
    const next = sqliteAzureSnapshotStore.queryExecucoes({ planKey: "PlanoA", limit: 1, offset: 1, q: "" });
    assert.equal(page.total, 2);
    assert.equal(page.limit, 1);
    assert.equal(page.offset, 0);
    assert.equal(page.rows.length, 1);
    assert.equal(next.rows.length, 1);
    assert.ok(page.rows[0]!.id < next.rows[0]!.id);
    assert.equal(page.rows[0]?.test_point_id, 1);
    assert.equal(next.rows[0]?.test_point_id, 2);

    const falhas = sqliteAzureSnapshotStore.queryFalhas({ planKey: "PlanoA", limit: 2, offset: 1, q: "" });
    assert.equal(falhas.total, 3);
    assert.equal(falhas.offset, 1);
    assert.deepEqual(falhas.rows.map((row) => row.bug_id), [11, 12]);
    assert.ok(falhas.rows[0]!.id < falhas.rows[1]!.id);
  });

  it("o segundo replace troca o snapshot inteiro e preserva metas que não foram enviadas", () => {
    sqliteAzureSnapshotStore.replaceSnapshot({
      execucoes: [exec({ plan_key: "PlanoB", suite_name: "Nova", test_point_id: 9, test_case_title: "só B" })],
      falhas: [falha({ plan_key: "PlanoB", bug_id: 90, titulo: "nova falha" })],
      meta: { kpi_plan_key: "PlanoB" },
    });

    assert.equal(sqliteAzureSnapshotStore.listExecucoes("PlanoA").length, 0);
    assert.equal(sqliteAzureSnapshotStore.listFalhas("PlanoA").length, 0);
    assert.deepEqual(
      sqliteAzureSnapshotStore.listExecucoes("PlanoB").map((row) => row.test_point_id),
      [9],
    );
    assert.deepEqual(
      sqliteAzureSnapshotStore.listFalhas("PlanoB").map((row) => row.bug_id),
      [90],
    );
    const all = sqliteAzureSnapshotStore.queryExecucoes({ planKey: "PlanoB", limit: 50, offset: 0, q: "" });
    assert.equal(all.total, 1);
    assert.equal(all.rows.every((row) => row.plan_key === "PlanoB"), true);
    assert.equal(sqliteMetaStore.get("kpi_plan_key"), "PlanoB");
    assert.equal(sqliteMetaStore.get("ultima_sincronizacao_azure"), "2026-10-08T12:00:00.000Z");
    assert.equal(sqliteMetaStore.get("data_inicio"), "2026-10-12");
    assert.equal(sqliteMetaStore.get("cabecalho_titulo"), "STATUS REPORT QA");
    assert.equal(sqliteMetaStore.get("planejamento_legado_plan_key"), "LegadoA");
  });

  it("falha no meio desfaz o replace e mantém o snapshot anterior", () => {
    const broken = exec({ plan_key: "Quebra", test_point_id: 99 });
    delete (broken as { suite_name?: string }).suite_name;

    assert.throws(() =>
      sqliteAzureSnapshotStore.replaceSnapshot({
        execucoes: [exec({ plan_key: "Quebra", test_point_id: 98, suite_name: "parcial" }), broken],
        falhas: [falha({ plan_key: "Quebra", bug_id: 1, titulo: "não pode ficar" })],
        meta: { kpi_plan_key: "Quebra", data_inicio: "1999-01-01" },
      }),
    );

    assert.deepEqual(
      sqliteAzureSnapshotStore.listExecucoes("PlanoB").map((row) => row.test_point_id),
      [9],
    );
    assert.equal(sqliteAzureSnapshotStore.listExecucoes("Quebra").length, 0);
    assert.equal(sqliteAzureSnapshotStore.listFalhas("Quebra").length, 0);
    assert.deepEqual(
      sqliteAzureSnapshotStore.listFalhas("PlanoB").map((row) => row.bug_id),
      [90],
    );
    assert.equal(sqliteMetaStore.get("kpi_plan_key"), "PlanoB");
    assert.equal(sqliteMetaStore.get("data_inicio"), "2026-10-12");
    assert.equal(sqliteMetaStore.get("planejamento_legado_plan_key"), "LegadoA");
  });

  it("não pagina execuções nem falhas sem plano e não mistura PlanKeys", () => {
    sqliteAzureSnapshotStore.replaceSnapshot({
      execucoes: [
        exec({ plan_key: "PlanoA", suite_name: "A", test_point_id: 1, test_case_title: "caso A" }),
        exec({ plan_key: "PlanoB", suite_name: "B", test_point_id: 2, test_case_title: "caso B" }),
      ],
      falhas: [
        falha({ plan_key: "PlanoA", bug_id: 1, titulo: "falha A" }),
        falha({ plan_key: "PlanoB", bug_id: 2, titulo: "falha B" }),
      ],
      meta: { kpi_plan_key: "PlanoA" },
    });

    assert.throws(
      () => sqliteAzureSnapshotStore.queryExecucoes({ limit: 50, offset: 0, q: "" }),
      /planKey obrigatório/,
    );
    assert.throws(
      () => sqliteAzureSnapshotStore.queryExecucoes({ planKey: "", limit: 50, offset: 0, q: "" }),
      /planKey obrigatório/,
    );
    assert.throws(
      () => sqliteAzureSnapshotStore.queryFalhas({ planKey: "   ", limit: 50, offset: 0, q: "" }),
      /planKey obrigatório/,
    );

    const execucoesA = sqliteAzureSnapshotStore.queryExecucoes({ planKey: "PlanoA", limit: 50, offset: 0, q: "" });
    assert.equal(execucoesA.total, 1);
    assert.deepEqual(execucoesA.rows.map((row) => row.plan_key), ["PlanoA"]);

    const falhasB = sqliteAzureSnapshotStore.queryFalhas({ planKey: "PlanoB", limit: 50, offset: 0, q: "" });
    assert.equal(falhasB.total, 1);
    assert.deepEqual(falhasB.rows.map((row) => row.plan_key), ["PlanoB"]);

    const ausente = sqliteAzureSnapshotStore.queryExecucoes({ planKey: "Inexistente", limit: 50, offset: 0, q: "" });
    assert.equal(ausente.total, 0);
    assert.equal(ausente.rows.length, 0);
    assert.equal(sqliteAzureSnapshotStore.queryFalhas({ planKey: "Inexistente", limit: 50, offset: 0, q: "" }).total, 0);
  });
});
