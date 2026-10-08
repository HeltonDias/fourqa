import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DetectedDimension } from "./dimensions.js";
import { groupExecucoesForReport } from "./reportGroups.js";
import type { ExecucaoRow } from "../types.js";

function dim(partial: Pick<DetectedDimension, "key" | "role"> & Partial<DetectedDimension>): DetectedDimension {
  return {
    label: partial.key,
    level: 1,
    values: [],
    confidence: 1,
    visible: true,
    ...partial,
  };
}

function point(partial: Partial<ExecucaoRow> & Pick<ExecucaoRow, "test_point_id">): ExecucaoRow {
  return {
    id: partial.test_point_id ?? 0,
    plan_key: "PlanA",
    plan_id: 1,
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
    test_case_id: partial.test_point_id,
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
    test_case_tags: null,
    ...partial,
  };
}

const frontAndProcess = [
  dim({ key: "front", role: "front", level: 1 }),
  dim({ key: "process", role: "process", level: 2 }),
];

describe("groupExecucoesForReport", () => {
  it("mesmo processo em 3 frentes gera 3 linhas com a contagem de cada uma", () => {
    const rows = [1, 2, 3].flatMap((front) =>
      Array.from({ length: 5 }, (_, index) =>
        point({
          test_point_id: front * 10 + index,
          suite_name: "Processo/Function 1",
          dimensions_json: JSON.stringify({
            front: `Frente/Feature ${front}`,
            process: "Processo/Function 1",
          }),
        }),
      ),
    );
    const groups = groupExecucoesForReport(rows, frontAndProcess);
    assert.equal(groups.length, 3);
    assert.deepEqual(
      groups.map((group) => group.rows.length).sort((a, b) => a - b),
      [5, 5, 5],
    );
    const fronts = groups.map((group) => group.classificacao.front).sort();
    assert.deepEqual(fronts, ["Frente/Feature 1", "Frente/Feature 2", "Frente/Feature 3"]);
    assert.ok(groups.every((group) => group.classificacao.process === "Processo/Function 1"));
    assert.equal(
      groups.reduce((sum, group) => sum + group.rows.length, 0),
      rows.length,
    );
    const seen = groups.flatMap((group) => group.rows.map((row) => row.test_point_id));
    assert.equal(new Set(seen).size, rows.length);
  });

  it("dois processos diferentes na mesma frente continuam separados", () => {
    const rows = [
      point({
        test_point_id: 1,
        suite_name: "Processo/Function 1",
        dimensions_json: JSON.stringify({ front: "Frente/Feature 1", process: "Processo/Function 1" }),
      }),
      point({
        test_point_id: 2,
        suite_name: "Processo/Function 1",
        dimensions_json: JSON.stringify({ front: "Frente/Feature 1", process: "Processo/Function 1" }),
      }),
      point({
        test_point_id: 3,
        suite_name: "Processo/Function 2",
        dimensions_json: JSON.stringify({ front: "Frente/Feature 1", process: "Processo/Function 2" }),
      }),
    ];
    const groups = groupExecucoesForReport(rows, frontAndProcess);
    assert.equal(groups.length, 2);
    const byProcess = new Map(groups.map((group) => [group.classificacao.process, group.rows.length]));
    assert.equal(byProcess.get("Processo/Function 1"), 2);
    assert.equal(byProcess.get("Processo/Function 2"), 1);
    assert.equal(
      groups.reduce((sum, group) => sum + group.rows.length, 0),
      rows.length,
    );
  });

  it("plano sem dimensão process não perde execuções e agrupa pela suíte", () => {
    const onlyFront = [dim({ key: "front", role: "front" })];
    const rows = [
      point({ test_point_id: 1, suite_name: "Suíte A", frente: "Bloco 1" }),
      point({ test_point_id: 2, suite_name: "Suíte A", frente: "Bloco 2" }),
      point({ test_point_id: 3, suite_name: "Suíte B", frente: "Bloco 1" }),
      point({ test_point_id: 4, suite_name: "", frente: "Bloco 1" }),
    ];
    const groups = groupExecucoesForReport(rows, onlyFront);
    assert.equal(groups.length, 3);
    const suiteA = groups.find((group) => group.processo === "Suíte A");
    assert.equal(suiteA?.rows.length, 2);
    assert.equal(
      groups.reduce((sum, group) => sum + group.rows.length, 0),
      rows.length,
    );
  });

  it("plano legado com frente e sem process permanece uma linha por suíte", () => {
    const legacyDims = [dim({ key: "front", role: "front", label: "Frente" })];
    const rows = [
      point({
        test_point_id: 1,
        suite_name: "Cadastro de Protocolo",
        frente: "GESIN",
        dimensions_json: JSON.stringify({ front: "GESIN" }),
      }),
      point({
        test_point_id: 2,
        suite_name: "Cadastro de Protocolo",
        frente: "GESIN",
        dimensions_json: JSON.stringify({ front: "GESIN" }),
      }),
      point({
        test_point_id: 3,
        suite_name: "40 - CONFERIR BAIXA NO SIAS",
        frente: "GERORJ",
        dimensions_json: JSON.stringify({ front: "GERORJ" }),
      }),
    ];
    const groups = groupExecucoesForReport(rows, legacyDims);
    assert.equal(groups.length, 2);
    assert.deepEqual(
      groups.map((group) => [group.processo, group.rows.length]),
      [
        ["Cadastro de Protocolo", 2],
        ["40 - CONFERIR BAIXA NO SIAS", 1],
      ],
    );
    assert.equal(
      groups.reduce((sum, group) => sum + group.rows.length, 0),
      rows.length,
    );
  });
});
