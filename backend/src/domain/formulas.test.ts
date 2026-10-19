import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ExecucaoRow } from "../types.js";
import {
  classifyExecution,
  finalizadosComCancelados,
  metricasDosPontos,
  totalRealizadoLinha,
  type StatusCenario,
} from "./formulas.js";

function row(outcome: string, testCaseState = "", testPointState = "") {
  return { outcome, test_case_state: testCaseState, test_point_state: testPointState };
}

describe("classifyExecution", () => {
  it("Passed conta como passed mesmo com Test Case Closed, QA, Ressalva ou UAT", () => {
    for (const state of ["Closed", "QA", "Ressalva", "UAT", "BUG"]) {
      assert.equal(classifyExecution(row("Passed", state, "Completed")), "passed");
    }
  });

  it("NotApplicable vira N/A (Closed no vocabulário da planilha)", () => {
    assert.equal(classifyExecution(row("NotApplicable", "Closed")), "na");
  });

  it("Failed e Blocked ignoram o estado do Test Case", () => {
    assert.equal(classifyExecution(row("Failed", "BUG")), "falhado");
    assert.equal(classifyExecution(row("Blocked", "QA")), "bloqueado");
  });

  it("sem execução: Design, Não atribuído, Ready e o resto", () => {
    assert.equal(classifyExecution(row("", "Design", "NotReady")), "design");
    assert.equal(classifyExecution(row("", "Não atribuído", "NotReady")), "naoLiberado");
    assert.equal(classifyExecution(row("", "QA", "Ready")), "liberado");
    assert.equal(classifyExecution(row("", "QA", "NotReady")), "naoLiberado");
  });

  it("a soma das colunas fecha com o total", () => {
    const casos = [
      row("Passed", "Closed"),
      row("Passed", "QA"),
      row("NotApplicable"),
      row("Failed", "BUG"),
      row("Blocked"),
      row("", "Design"),
      row("", "QA", "Ready"),
      row("", "QA", "NotReady"),
    ];
    const buckets = new Map<StatusCenario, number>();
    for (const c of casos) {
      const k = classifyExecution(c);
      buckets.set(k, (buckets.get(k) ?? 0) + 1);
    }
    const soma = [...buckets.values()].reduce((a, n) => a + n, 0);
    assert.equal(soma, casos.length);
  });
});

function ponto(outcome: string, testCaseState = "", testPointState = ""): ExecucaoRow {
  return { outcome, test_case_state: testCaseState, test_point_state: testPointState } as ExecucaoRow;
}

describe("finalizados do Report e da aba Status", () => {
  const mistos = [
    ponto("Passed", "Closed"),
    ponto("Passed", "QA"),
    ponto("NotApplicable"),
    ponto("Failed", "BUG"),
    ponto("Blocked"),
    ponto("", "Design"),
    ponto("", "QA", "Ready"),
    ponto("", "QA", "NotReady"),
  ];

  it("o Report soma só Passed e N/A, mesmo com cancelados legados", () => {
    const metrics = metricasDosPontos(mistos);
    assert.equal(totalRealizadoLinha(metrics), 3);
    assert.equal(metrics.cts_passeds + metrics.cts_na + metrics.cts_falhados + metrics.cts_bloqueados + metrics.cts_liberados + metrics.cts_design + metrics.cts_nao_liberados, mistos.length);
  });

  it("Pendentes é o complemento e cancelados não entram na partição", () => {
    const metrics = metricasDosPontos(mistos);
    const total = mistos.length;
    const finalizados = totalRealizadoLinha(metrics);
    const pendentes = total - finalizados;
    assert.equal(pendentes, metrics.cts_falhados + metrics.cts_bloqueados + metrics.cts_liberados + metrics.cts_nao_liberados + metrics.cts_design);
    assert.equal(finalizados + pendentes, total);
  });

  it("a aba Status continua somando os cancelados legados", () => {
    const metrics = metricasDosPontos([ponto("Passed"), ponto("NotApplicable")]);
    assert.equal(finalizadosComCancelados(metrics, 4), 6);
    assert.equal(totalRealizadoLinha(metrics), 2);
    assert.equal(finalizadosComCancelados(metrics, 0), 2);
  });
});
