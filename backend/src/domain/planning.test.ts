import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { detectDimensions } from "./dimensions.js";
import {
  assessPoint,
  classificationIntegrityMessage,
  diffScope,
  nextRevision,
  scheduleIntegrityMessage,
  matchScheduleItem,
  normalizeSuiteFill,
  scheduleItemsForScope,
  scheduleOf,
  scopeIdentity,
  scopeGroupKey,
  loneLooseFill,
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

describe("agrupamento da revisão sem suíte", () => {
  const ref = (partial: Partial<ScopeRef>): ScopeRef => ({
    planId: 1,
    suiteId: null,
    testPointId: null,
    testCaseId: null,
    ...partial,
  });

  it("agrupa a mesma suíte e separa Test Points sem suíte", () => {
    const scope = [
      ref({ suiteId: 10, testPointId: 1 }),
      ref({ suiteId: 10, testPointId: 2 }),
      ref({ testPointId: 3 }),
      ref({ testPointId: 4 }),
    ];
    assert.equal(scopeGroupKey(scope[0]!, 0), scopeGroupKey(scope[1]!, 1));
    assert.notEqual(scopeGroupKey(scope[2]!, 2), scopeGroupKey(scope[3]!, 3));
    assert.equal(scopeGroupKey(scope[2]!, 2), "point:3");
  });

  it("não junta linhas sem suíte e sem Test Point", () => {
    const a = ref({ label: "mesmo" });
    const b = ref({ label: "mesmo" });
    assert.notEqual(scopeGroupKey(a, 0), scopeGroupKey(b, 1));
  });

  it("copia a agenda sem suíte só quando os dois lados têm um único item", () => {
    const fill = { start: "2026-10-12", allocations: [{ date: "2026-10-13", quantity: 2 }] };
    assert.equal(loneLooseFill([fill], 1), fill);
    assert.equal(loneLooseFill([fill], 2), undefined);
    assert.equal(loneLooseFill([fill, fill], 1), undefined);
  });
});

describe("identidade da agenda", () => {
  const ref = (partial: Partial<ScopeRef>): ScopeRef => ({
    planId: 7,
    suiteId: null,
    testPointId: null,
    testCaseId: null,
    label: "mesmo nome",
    ...partial,
  });
  const previous = (partial: Partial<ReturnType<typeof scheduleItemsForScope>[number]>): ReturnType<typeof scheduleItemsForScope>[number] => ({
    suiteId: null,
    testPointId: null,
    testCaseId: null,
    suiteName: "mesmo nome",
    plannedStart: "2026-10-01",
    plannedEnd: "2026-10-20",
    responsavel: null,
    prioridade: null,
    baselineQuantity: 1,
    allocations: [{ date: "2026-10-02", quantity: 1 }],
    ...partial,
  });

  it("separa o mesmo nome com IDs diferentes e o mesmo Test Case em suítes diferentes", () => {
    const next = scheduleItemsForScope({
      scope: [
        ref({ suiteId: 1, testPointId: 11, testCaseId: 90, label: "Cadastro" }),
        ref({ suiteId: 2, testPointId: 22, testCaseId: 90, label: "Cadastro" }),
      ],
      suiteNames: new Map([[1, "Cadastro novo"], [2, "Cadastro novo"]]),
      previous: [
        previous({ suiteId: 1, suiteName: "Cadastro antigo", plannedStart: "2026-10-03" }),
        previous({ suiteId: 2, plannedStart: "2026-10-09" }),
      ],
    });
    assert.equal(next.length, 2);
    assert.equal(next[0]?.testPointId, null);
    assert.equal(next[0]?.testCaseId, null);
    assert.equal(next[0]?.suiteName, "Cadastro novo");
    assert.equal(next[0]?.plannedStart, "2026-10-03");
    assert.equal(next[1]?.plannedStart, "2026-10-09");
  });

  it("mantém o preenchimento ao entrar um cenário e não apaga o histórico da função", () => {
    const kept = scheduleItemsForScope({
      scope: [
        ref({ suiteId: 1, testPointId: 11, testCaseId: 90 }),
        ref({ suiteId: 1, testPointId: 12, testCaseId: 91 }),
      ],
      suiteNames: new Map([[1, "Suíte renomeada"]]),
      previous: [previous({ suiteId: 1, suiteName: "Suíte antiga", baselineQuantity: 1 })],
    });
    assert.equal(kept.length, 1);
    assert.equal(kept[0]?.baselineQuantity, 2);
    assert.equal(kept[0]?.plannedStart, "2026-10-01");
    assert.equal(kept[0]?.suiteName, "Suíte renomeada");

    const removed = scheduleItemsForScope({
      scope: [ref({ suiteId: 1, testPointId: 11, testCaseId: 90 })],
      suiteNames: new Map([[1, "Suíte"]]),
      previous: [
        previous({ suiteId: 1, plannedStart: "2026-10-04" }),
        previous({ suiteId: 8, plannedStart: "2026-11-01" }),
      ],
    });
    assert.equal(removed.length, 1);
    assert.equal(removed[0]?.suiteId, 1);
    assert.equal(removed[0]?.plannedStart, "2026-10-04");
  });

  it("não associa itens sem suíte pelo nome e recusa editar vários sem identidade", () => {
    const next = scheduleItemsForScope({
      scope: [
        ref({ testPointId: 5, testCaseId: 90 }),
        ref({ testPointId: 6, testCaseId: 90 }),
        ref({}),
        ref({}),
      ],
      suiteNames: new Map(),
      previous: [
        previous({ testPointId: 5, testCaseId: 90, plannedStart: "2026-08-01" }),
        previous({ testPointId: 6, testCaseId: 90, plannedStart: "2026-08-02" }),
        previous({ plannedStart: "2026-08-03" }),
        previous({ plannedStart: "2026-08-04" }),
      ],
    });
    assert.deepEqual(next.map((item) => item.plannedStart), ["2026-08-01", "2026-08-02", null, null]);
    assert.deepEqual(next.map((item) => item.testCaseId), [90, 90, null, null]);
    const rows = next.map((item, index) => ({ ...item, id: index + 1 }));
    assert.equal(matchScheduleItem(rows, { suiteId: null, testPointId: 6 })?.id, 2);
    assert.equal(matchScheduleItem(rows, { suiteId: null }), undefined);
    assert.equal(matchScheduleItem([rows[2]!], { suiteId: null })?.id, 3);
  });

  it("preserva responsável e prioridade da suíte e não empresta a outra linha", () => {
    const next = scheduleItemsForScope({
      scope: [
        ref({ suiteId: 1, testPointId: 11, testCaseId: 90 }),
        ref({ suiteId: 1, testPointId: 12, testCaseId: 91 }),
        ref({ suiteId: 2, testPointId: 22, testCaseId: 90 }),
        ref({ suiteId: 3, testPointId: 33, testCaseId: 33 }),
        ref({ testPointId: 44, testCaseId: 90 }),
      ],
      suiteNames: new Map([[1, "Cadastro"], [2, "Cadastro"], [3, "Nova"]]),
      previous: [
        previous({ suiteId: 1, responsavel: "Ana", prioridade: "Alta", plannedStart: "2026-10-03" }),
        previous({ suiteId: 2, responsavel: "Bruno", prioridade: "Baixa" }),
      ],
    });
    const bySuite = new Map(next.filter((item) => item.suiteId != null).map((item) => [item.suiteId, item]));
    assert.equal(bySuite.get(1)?.responsavel, "Ana");
    assert.equal(bySuite.get(1)?.prioridade, "Alta");
    assert.equal(bySuite.get(1)?.baselineQuantity, 2);
    assert.equal(bySuite.get(2)?.responsavel, "Bruno");
    assert.equal(bySuite.get(3)?.responsavel, null);
    assert.equal(bySuite.get(3)?.prioridade, null);
    const loose = next.find((item) => item.testPointId === 44);
    assert.equal(loose?.responsavel, null);
    assert.equal(loose?.prioridade, null);
  });
});

describe("preenchimento manual da suíte", () => {
  it("normaliza vazio para null e recusa texto acima do limite sem cortar", () => {
    assert.equal(normalizeSuiteFill("  Ana  "), "Ana");
    assert.equal(normalizeSuiteFill("   "), null);
    assert.equal(normalizeSuiteFill(null), null);
    assert.equal(normalizeSuiteFill("x".repeat(80)), "x".repeat(80));
    assert.throws(() => normalizeSuiteFill(` ${"x".repeat(81)}`), /80 caracteres/);
  });
});
