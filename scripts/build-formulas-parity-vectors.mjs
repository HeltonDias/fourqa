#!/usr/bin/env node
/** Gera backend/shared/formulas-parity-vectors.json a partir de formulas.ts (fonte de verdade Node). */
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  estadoPonto,
  classifyExecution,
  countExecucoes,
  metricasPorProcesso,
  metricasDosPontos,
  totalRealizadoLinha,
  finalizadosComCancelados,
  impactoTotalTestPoint,
  classificarImpactosKpi,
  countFalhas,
  sumifFrente,
} from "../backend/src/domain/formulas.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outPath = path.join(root, "backend/shared/formulas-parity-vectors.json");

function row(partial) {
  return {
    plan_key: "EndToEnd",
    suite_id: 1,
    suite_name: "SuiteA",
    responsabilidade: "QA",
    test_case_state: "",
    test_point_state: "",
    outcome: "",
    test_case_title: "",
    test_case_tags: "",
    last_result_id: null,
    ...partial,
  };
}

function falha(partial) {
  return {
    plan_key: "EndToEnd",
    responsavel: "",
    bug_id: null,
    frente: "",
    titulo: "",
    status: "",
    criacao: "",
    fechamento: "",
    ...partial,
  };
}

const estadoPontoCases = [
  { outcome: "passed", test_point_state: "Completed", expected: "Passed" },
  { outcome: "FAILED", test_point_state: "X", expected: "Failed" },
  { outcome: "Blocked", test_point_state: "", expected: "Blocked" },
  { outcome: "NotApplicable", test_point_state: "Completed", expected: "Closed" },
  { outcome: "", test_point_state: "Ready", expected: "Ready" },
  { outcome: "", test_point_state: "NotReady", expected: "Unspecified" },
  { outcome: "", test_point_state: "", expected: "" },
];

const classifyCases = [
  { outcome: "Passed", test_case_state: "BUG", test_point_state: "Completed", expected: "passed" },
  { outcome: "NotApplicable", test_case_state: "Closed", test_point_state: "", expected: "na" },
  { outcome: "", test_case_state: "nao atribuido", test_point_state: "NotReady", expected: "naoLiberado" },
];

const execRows = [
  row({ suite_name: "SuiteA", outcome: "Passed", test_point_state: "Completed" }),
  row({ suite_name: "SuiteA", outcome: "Failed", test_point_state: "Failed" }),
  row({ suite_name: "SuiteB", outcome: "Blocked", test_point_state: "Blocked" }),
  row({ plan_key: "Other", suite_name: "SuiteA", outcome: "Passed" }),
];

const falhaRows = [
  falha({ frente: "Login", status: "New", bug_id: 10, responsavel: "Foursys" }),
  falha({ frente: "Outro", status: "Closed", bug_id: 11, fechamento: "2026-01-01" }),
];

const vectors = {
  version: 1,
  generated_from: "backend/src/domain/formulas.ts",
  estadoPonto: estadoPontoCases.map((c) => ({
    ...c,
    actual: estadoPonto({ outcome: c.outcome, test_point_state: c.test_point_state }),
  })),
  classifyExecution: classifyCases.map((c) => ({
    ...c,
    actual: classifyExecution({
      outcome: c.outcome,
      test_case_state: c.test_case_state,
      test_point_state: c.test_point_state,
    }),
  })),
  countExecucoes: {
    rows: execRows,
    filter: { planKey: "EndToEnd", suiteName: "SuiteA", testPointState: "Failed" },
    expected: countExecucoes(execRows, { planKey: "EndToEnd", suiteName: "SuiteA", testPointState: "Failed" }),
  },
  metricasPorProcesso: {
    rows: execRows,
    planKey: "EndToEnd",
    processo: "SuiteA",
    expected: metricasPorProcesso(execRows, "EndToEnd", "SuiteA"),
  },
  metricasPorProcessoEmpty: {
    rows: execRows,
    planKey: "EndToEnd",
    processo: "",
    expected: metricasPorProcesso(execRows, "EndToEnd", ""),
  },
  totalRealizadoLinha: {
    metrics: metricasDosPontos(execRows),
    expected: totalRealizadoLinha(metricasDosPontos(execRows)),
  },
  finalizadosComCancelados: {
    metrics: metricasDosPontos([row({ outcome: "Passed" })]),
    cancelados: 3,
    expected: finalizadosComCancelados(metricasDosPontos([row({ outcome: "Passed" })]), 3),
  },
  impactoTotalTestPoint: {
    rows: execRows,
    planKey: "EndToEnd",
    expected: impactoTotalTestPoint(execRows, "EndToEnd"),
  },
  classificarImpactosKpi: {
    execRows: [
      row({
        outcome: "Failed",
        test_case_tags: "Login",
        test_case_title: "CT login",
      }),
    ],
    falhaRows: [falha({ frente: "Login", status: "Active", bug_id: 5, responsavel: "Foursys QA" })],
    planKey: "EndToEnd",
    expected: classificarImpactosKpi(
      [row({ outcome: "Failed", test_case_tags: "Login", test_case_title: "CT login" })],
      [falha({ frente: "Login", status: "Active", bug_id: 5, responsavel: "Foursys QA" })],
      "EndToEnd",
    ),
  },
  countFalhas: {
    rows: falhaRows,
    filter: { planKey: "EndToEnd", statusNot: "Closed", idNotEmpty: true },
    expected: countFalhas(falhaRows, { planKey: "EndToEnd", statusNot: "Closed", idNotEmpty: true }),
  },
  sumifFrente: {
    rows: [{ frente: "Modulo Login", pts: 5 }, { frente: "OUTRO", pts: 2 }],
    needle: "login",
    field: "pts",
    expected: sumifFrente(
      [{ frente: "Modulo Login", pts: 5 }, { frente: "OUTRO", pts: 2 }],
      "login",
      "pts",
    ),
  },
};

for (const c of vectors.estadoPonto) {
  if (c.actual !== c.expected) throw new Error(`estadoPonto mismatch ${JSON.stringify(c)}`);
}
for (const c of vectors.classifyExecution) {
  if (c.actual !== c.expected) throw new Error(`classify mismatch ${JSON.stringify(c)}`);
}

mkdirSync(path.dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(vectors, null, 2)}\n`, "utf8");
console.log(`wrote ${outPath}`);
