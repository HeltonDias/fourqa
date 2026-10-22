import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ExecucaoInsert } from "../azure/execucoes.js";
import type { FalhaInsert } from "../azure/falhas.js";
import {
  ensureSyncPublishable,
  SyncValidationError,
  syncPlanGatesAfterLoad,
  syncPlanGatesFromConfig,
  validateSyncResult,
} from "./validateSync.js";
import type { SyncConfig } from "../azure/config.js";

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
    case_priority: null,
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

  it("lote incompleto, filtro, MaxSuites e plano ausente não publicam", () => {
    assert.throws(
      () =>
        ensureSyncPublishable(
          [
            { planKey: "E2E", suiteFilter: true, maxSuites: false, loaded: true },
            { planKey: "UAT", suiteFilter: false, maxSuites: true, loaded: false },
          ],
          true,
        ),
      (err: unknown) => {
        assert.ok(err instanceof SyncValidationError);
        const msg = err.message;
        assert.match(msg, /filtro/i);
        assert.match(msg, /MaxSuites/i);
        assert.match(msg, /UAT/i);
        assert.match(msg, /não terminou/i);
        return true;
      },
    );
    assert.doesNotThrow(() =>
      ensureSyncPublishable([{ planKey: "E2E", suiteFilter: false, maxSuites: false, loaded: true }], false),
    );
  });

  it("syncPlanGatesFromConfig bloqueia filtro antes da coleta", () => {
    const cfg = {
      plans: [{ planKey: "E2E", planId: 1, planName: "E2E", suiteNameFilter: "Cadastro", maxSuites: 0 }],
    } as SyncConfig;
    assert.throws(() => ensureSyncPublishable(syncPlanGatesFromConfig(cfg, true), false), /filtro/i);
  });

  it("syncPlanGatesAfterLoad exige cada plano da config", () => {
    const cfg = {
      plans: [
        { planKey: "E2E", planId: 1, planName: "E2E", suiteNameFilter: "", maxSuites: 0 },
        { planKey: "UAT", planId: 2, planName: "UAT", suiteNameFilter: "", maxSuites: 0 },
      ],
    } as SyncConfig;
    assert.throws(() => ensureSyncPublishable(syncPlanGatesAfterLoad(cfg, ["E2E"]), false), /UAT/i);
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
