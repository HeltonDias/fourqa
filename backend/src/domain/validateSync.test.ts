import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ExecucaoInsert } from "../azure/execucoes.js";
import type { FalhaInsert } from "../azure/falhas.js";
import { SyncValidationError, validateSyncResult } from "./validateSync.js";

function exec(partial: Partial<ExecucaoInsert> = {}): ExecucaoInsert {
  return {
    plan_key: "PlanoA",
    plan_id: 1,
    plan_name: "Plano",
    frente: null,
    atalho: null,
    processo: null,
    suite_id: 10,
    suite_name: "Suíte",
    parent_suite_id: null,
    suite_depth: 1,
    suite_path: "[]",
    dimensions_json: "{}",
    test_point_id: 100,
    test_case_id: 200,
    test_case_title: "CT",
    responsabilidade: null,
    test_case_state: "QA",
    test_point_state: "Completed",
    outcome: "Passed",
    date_completed: null,
    run_by: null,
    last_updated_date: null,
    last_test_run_id: null,
    last_result_id: null,
    test_case_link: null,
    test_case_tags: null,
    ...partial,
  };
}

function falha(bug_id: number): FalhaInsert {
  return {
    plan_key: "PlanoA",
    responsavel: null,
    ambiente: null,
    categoria: null,
    bug_id,
    impacto: 1,
    frente: null,
    titulo: "bug",
    status: "New",
    criacao: null,
    fechamento: null,
    links: null,
    tags: null,
  };
}

describe("validateSyncResult", () => {
  it("aceita um lote consistente", () => {
    assert.doesNotThrow(() =>
      validateSyncResult({
        execucoes: [exec(), exec({ test_point_id: 101, outcome: "Failed" })],
        falhas: [falha(9)],
        suites: [{ suiteId: 10, parentSuiteId: null }],
      }),
    );
  });

  it("não deixa gravar lote vazio", () => {
    assert.throws(
      () => validateSyncResult({ execucoes: [], falhas: [], suites: [] }),
      SyncValidationError,
    );
  });

  it("recusa TestPointId duplicado", () => {
    assert.throws(
      () =>
        validateSyncResult({
          execucoes: [exec(), exec()],
          falhas: [],
          suites: [{ suiteId: 10, parentSuiteId: null }],
        }),
      /duplicado/i,
    );
  });

  it("recusa BugId duplicado no mesmo plano", () => {
    assert.throws(
      () =>
        validateSyncResult({
          execucoes: [exec()],
          falhas: [falha(9), falha(9)],
          suites: [{ suiteId: 10, parentSuiteId: null }],
        }),
      /BugId duplicado/,
    );
  });
});
