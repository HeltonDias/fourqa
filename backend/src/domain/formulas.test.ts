import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyExecution, type StatusCenario } from "./formulas.js";

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
