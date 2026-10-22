#!/usr/bin/env node
/** Valida formulas.ts contra backend/shared/formulas-parity-vectors.json */
import { readFileSync } from "node:fs";
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
const vectors = JSON.parse(
  readFileSync(path.join(root, "backend/shared/formulas-parity-vectors.json"), "utf8"),
);

function assertEq(actual, expected, label) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${label}: expected ${e} got ${a}`);
}

for (const c of vectors.estadoPonto) {
  const actual = estadoPonto({ outcome: c.outcome, test_point_state: c.test_point_state });
  assertEq(actual, c.expected, "estadoPonto");
}

for (const c of vectors.classifyExecution) {
  const actual = classifyExecution({
    outcome: c.outcome,
    test_case_state: c.test_case_state,
    test_point_state: c.test_point_state,
  });
  assertEq(actual, c.expected, "classifyExecution");
}

assertEq(
  countExecucoes(vectors.countExecucoes.rows, vectors.countExecucoes.filter),
  vectors.countExecucoes.expected,
  "countExecucoes",
);

assertEq(
  metricasPorProcesso(
    vectors.metricasPorProcesso.rows,
    vectors.metricasPorProcesso.planKey,
    vectors.metricasPorProcesso.processo,
  ),
  vectors.metricasPorProcesso.expected,
  "metricasPorProcesso",
);

assertEq(
  metricasPorProcesso(
    vectors.metricasPorProcessoEmpty.rows,
    vectors.metricasPorProcessoEmpty.planKey,
    vectors.metricasPorProcessoEmpty.processo,
  ),
  vectors.metricasPorProcessoEmpty.expected,
  "metricasPorProcessoEmpty",
);

assertEq(
  totalRealizadoLinha(vectors.totalRealizadoLinha.metrics),
  vectors.totalRealizadoLinha.expected,
  "totalRealizadoLinha",
);

assertEq(
  finalizadosComCancelados(vectors.finalizadosComCancelados.metrics, vectors.finalizadosComCancelados.cancelados),
  vectors.finalizadosComCancelados.expected,
  "finalizadosComCancelados",
);

assertEq(
  impactoTotalTestPoint(vectors.impactoTotalTestPoint.rows, vectors.impactoTotalTestPoint.planKey),
  vectors.impactoTotalTestPoint.expected,
  "impactoTotalTestPoint",
);

assertEq(
  classificarImpactosKpi(
    vectors.classificarImpactosKpi.execRows,
    vectors.classificarImpactosKpi.falhaRows,
    vectors.classificarImpactosKpi.planKey,
  ),
  vectors.classificarImpactosKpi.expected,
  "classificarImpactosKpi",
);

assertEq(
  countFalhas(vectors.countFalhas.rows, vectors.countFalhas.filter),
  vectors.countFalhas.expected,
  "countFalhas",
);

const sumRows = vectors.sumifFrente.rows;
assertEq(
  sumifFrente(sumRows, vectors.sumifFrente.needle, vectors.sumifFrente.field),
  vectors.sumifFrente.expected,
  "sumifFrente",
);

console.log("formulas-parity (Node): OK");
