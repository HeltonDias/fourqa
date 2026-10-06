import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { detectDimensions } from "./dimensions.js";
import {
  assessPoint,
  classificationIntegrityMessage,
  diffScope,
  nextRevision,
  scheduleIntegrityMessage,
  scheduleOf,
  scopeIdentity,
  scopeIntegrityMessage,
  type ScopeRef,
} from "./planning.js";

function ct(partial: Partial<ScopeRef> & Pick<ScopeRef, "testPointId">): ScopeRef {
  return { planId: 1, suiteId: 10, testCaseId: partial.testPointId, label: "nome", ...partial };
}

describe("diffScope", () => {
  it("baseline igual à fonte não tem divergência", () => {
    const items = [ct({ testPointId: 1 }), ct({ testPointId: 2 })];
    const diff = diffScope(items, items.map((item) => ({ ...item, label: "outro texto" })));
    assert.equal(diff.addedCount, 0);
    assert.equal(diff.removedCount, 0);
    assert.equal(diff.baselineCount, 2);
  });

  it("CT novo depois da confirmação não entra no baseline", () => {
    const baseline = [ct({ testPointId: 1 })];
    const source = [ct({ testPointId: 1 }), ct({ testPointId: 2 })];
    const diff = diffScope(baseline, source);
    assert.equal(diff.baselineCount, 1);
    assert.equal(diff.addedCount, 1);
    assert.equal(diff.removedCount, 0);
  });

  it("CT removido conta mesmo se o total de outra suíte compensar", () => {
    const diff = diffScope([ct({ testPointId: 1 })], []);
    assert.equal(diff.removedCount, 1);
  });

  it("remove 1 e adiciona 1 mantém a quantidade e ainda é alteração de escopo", () => {
    const diff = diffScope([ct({ testPointId: 1 })], [ct({ testPointId: 2 })]);
    assert.equal(diff.baselineCount, diff.sourceCount);
    assert.equal(diff.addedCount, 1);
    assert.equal(diff.removedCount, 1);
    assert.notEqual(diff.addedCount + diff.removedCount, 0);
  });

  it("atalho ou texto diferente não muda a identidade quando os IDs permanecem", () => {
    const a = ct({ testPointId: 7, label: "Atalho antigo" });
    const b = ct({ testPointId: 7, label: "Atalho novo" });
    assert.equal(scopeIdentity(a), scopeIdentity(b));
    assert.equal(diffScope([a], [b]).addedCount, 0);
  });
});

describe("schedule", () => {
  it("soma das allocations diferente do baseline falha a integridade do cronograma", () => {
    const math = scheduleOf({
      baselineCount: 20,
      allocations: [
        { date: "2026-10-06", plannedQuantity: 5 },
        { date: "2026-10-07", plannedQuantity: 5 },
        { date: "2026-10-08", plannedQuantity: 8 },
      ],
      asOf: "2026-10-07",
      finalizedCount: 6,
    });
    assert.equal(math.distributedCount, 18);
    assert.equal(math.distributionGap, -2);
    assert.equal(scheduleIntegrityMessage(20, 18), "2 cenários ainda não distribuídos no cronograma");
    assert.equal(math.plannedToDate, 10);
    assert.equal(math.backlog, 4);
    assert.equal(math.aheadOfPlan, 0);
  });

  it("execução adiantada não vira backlog negativo", () => {
    const math = scheduleOf({
      baselineCount: 4,
      allocations: [{ date: "2026-10-06", plannedQuantity: 4 }],
      asOf: "2026-10-06",
      finalizedCount: 6,
    });
    assert.equal(math.backlog, 0);
    assert.equal(math.aheadOfPlan, 2);
  });

  it("plannedToDate usa a data e não a posição da coluna", () => {
    const math = scheduleOf({
      baselineCount: 9,
      allocations: [
        { date: "2026-10-08", plannedQuantity: 3 },
        { date: "06/10/2026", plannedQuantity: 3 },
        { date: "2026-10-07", plannedQuantity: 3 },
      ],
      asOf: "2026-10-07",
      finalizedCount: 0,
    });
    assert.equal(math.plannedToDate, 6);
  });
});

describe("classificação e integridade", () => {
  it("estado não mapeado continua no universo como unclassified", () => {
    const row = assessPoint({ outcome: "Unspecified", test_case_state: "Closed", test_point_state: "Completed" });
    assert.equal(row.classification, "unclassified");
    assert.equal(row.integrity, "unmapped");
    assert.match(classificationIntegrityMessage(1, 0) ?? "", /não classificado/);
  });

  it("Passed com BUG permanece Passed e a integridade fica inconsistente", () => {
    const row = assessPoint({ outcome: "Passed", test_case_state: "BUG", test_point_state: "Completed" });
    assert.equal(row.classification, "passed");
    assert.equal(row.integrity, "inconsistent");
  });
});

describe("revisão", () => {
  it("replanejamento cria versão nova e a anterior permanece", () => {
    const first = nextRevision(null, {
      at: "2026-10-01",
      reason: "confirmação",
      adoptSource: true,
      scope: [ct({ testPointId: 1 })],
    });
    const second = nextRevision(first.current, {
      at: "2026-10-06",
      reason: "ajuste de datas",
      adoptSource: false,
      scope: [ct({ testPointId: 1 }), ct({ testPointId: 99 })],
    });
    assert.equal(first.current.version, 1);
    assert.equal(second.current.version, 2);
    assert.equal(second.previous?.version, 1);
    assert.equal(second.previous?.scope.length, 1);
    assert.equal(second.current.scope.length, 1);
    assert.equal(second.current.scope[0]?.testPointId, 1);
  });

  it("baseline legado sem snapshot não inventa membership", () => {
    const message = scopeIntegrityMessage({ scopeSnapshotAvailable: false, addedCount: 0, removedCount: 0 });
    assert.match(message ?? "", /sem snapshot/);
    assert.equal(scopeIntegrityMessage({ scopeSnapshotAvailable: true, addedCount: 0, removedCount: 0 }), null);
  });
});

describe("dimensões no planejamento", () => {
  it("projeto sem Frente e sem Prioridade fica genérico, em qualquer ordem", () => {
    const frentePrimeiro = detectDimensions([
      { ancestors: [{ name: "Atendimento" }, { name: "Cadastro" }, { name: "Suíte" }] },
    ]);
    const invertido = detectDimensions([
      { ancestors: [{ name: "Funcionalidade" }, { name: "Processo A" }, { name: "Suíte" }] },
    ]);
    assert.equal(frentePrimeiro.every((d) => d.role === "generic"), true);
    assert.equal(invertido.every((d) => d.role === "generic"), true);
    assert.equal(frentePrimeiro.some((d) => d.role === "front" || d.role === "priority"), false);
  });
});
