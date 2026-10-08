import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyHierarchyOverrides,
  buildDimensionCatalog,
  detectDimensions,
  dimensionDefinitionsForPlan,
  inferDimensions,
  legacyRoleValue,
  resolveDimensionValues,
  valuesForPath,
} from "./dimensions.js";

describe("detectDimensions", () => {
  it("reconhece Prioridade e não chama o nível de Frente", () => {
    const dims = detectDimensions([
      { ancestors: [{ name: "Prioridade 0" }, { name: "GEDEV - Processo" }] },
      { ancestors: [{ name: "Prioridade 1" }, { name: "GEMCO - Outro" }] },
    ]);
    assert.equal(dims.length, 1);
    assert.equal(dims[0]?.role, "priority");
    assert.equal(dims[0]?.label, "Prioridade");
    assert.ok((dims[0]?.confidence ?? 0) >= 0.8);
  });

  it("nível desconhecido permanece genérico", () => {
    const dims = detectDimensions([
      { ancestors: [{ name: "Atendimento" }, { name: "Suíte A" }] },
      { ancestors: [{ name: "Cadastro" }, { name: "Suíte B" }] },
    ]);
    assert.equal(dims[0]?.role, "generic");
    assert.equal(dims[0]?.label, "Nível 1");
  });

  it("usa a lista de frentes do projeto só como dica, não como posição fixa", () => {
    const dims = detectDimensions(
      [
        { ancestors: [{ name: "Onda 1" }, { name: "GEDEV" }, { name: "Suíte" }] },
        { ancestors: [{ name: "Onda 1" }, { name: "GEMCO" }, { name: "Outra" }] },
      ],
      { knownFronts: ["GEDEV", "GEMCO"] },
    );
    assert.equal(dims.find((d) => d.level === 1)?.role, "generic");
    assert.equal(dims.find((d) => d.level === 2)?.role, "front");
  });

  it("override manual vence detecção automática mesmo com confiança 1", () => {
    const applied = applyHierarchyOverrides(
      [
        {
          key: "priority",
          label: "Prioridade",
          level: 1,
          values: ["Prioridade 0"],
          role: "priority",
          confidence: 1,
          visible: true,
        },
      ],
      [{ columnName: "Frente", sourceLevel: "1", active: true }],
    );
    assert.equal(applied[0]?.role, "front");
    assert.equal(applied[0]?.label, "Frente");
  });

  it("override manual nomeia nível genérico", () => {
    const detected = detectDimensions([
      { ancestors: [{ name: "Atendimento" }, { name: "Suíte" }] },
    ]);
    const applied = applyHierarchyOverrides(detected, [
      { columnName: "Frente", sourceLevel: "1", active: true },
    ]);
    assert.equal(applied[0]?.role, "front");
    assert.equal(applied[0]?.confidence, 1);
  });
});

const genericPath = {
  pathNames: ["Frente/Feature", "Processo/Function 1"],
  currentSuiteName: "Processo/Function 1",
};

function defsForPlan(
  planKey: string,
  rows: {
    columnName: string;
    sourceLevel?: string;
    sourceType?: "hierarchy_level" | "current_suite";
    active?: boolean;
    planKey?: string;
  }[],
) {
  return dimensionDefinitionsForPlan(
    planKey,
    rows.map((row, index) => ({
      order: index + 1,
      columnName: row.columnName,
      sourceLevel: row.sourceLevel ?? "1",
      active: row.active ?? true,
      planKey: row.planKey,
      sourceType: row.sourceType ?? "hierarchy_level",
    })),
  );
}

describe("resolveDimensionValues", () => {
  it("TESTE 1: Frente em nível 1 e Processo na suite atual", () => {
    const definitions = defsForPlan("PlanTest", [
      { columnName: "Frente", sourceLevel: "1" },
      { columnName: "Processo", sourceType: "current_suite", sourceLevel: "" },
    ]);
    const resolved = resolveDimensionValues(genericPath, definitions, []);
    assert.equal(resolved.front, "Frente/Feature");
    assert.equal(resolved.process, "Processo/Function 1");
  });

  it("TESTE 2: hierarchy_level 2 pode usar a folha", () => {
    const definitions = defsForPlan("PlanTest", [
      { columnName: "Frente", sourceLevel: "1" },
      { columnName: "Processo", sourceLevel: "2" },
    ]);
    const resolved = resolveDimensionValues(genericPath, definitions, []);
    assert.equal(resolved.front, "Frente/Feature");
    assert.equal(resolved.process, "Processo/Function 1");
  });

  it("TESTE 3: suiteName operacional preservado com Processo na folha", () => {
    const definitions = defsForPlan("PlanTest", [{ columnName: "Processo", sourceType: "current_suite" }]);
    const resolved = resolveDimensionValues(genericPath, definitions, []);
    assert.equal(genericPath.currentSuiteName, "Processo/Function 1");
    assert.equal(resolved.process, genericPath.currentSuiteName);
  });

  it("TESTE 4: árvore com mais níveis sem regra por nome", () => {
    const path = {
      pathNames: ["Produto", "Frente", "Processo"],
      currentSuiteName: "Processo",
    };
    const definitions = defsForPlan("Multi", [
      { columnName: "Produto", sourceLevel: "1" },
      { columnName: "Frente", sourceLevel: "2" },
      { columnName: "Processo", sourceLevel: "3" },
    ]);
    const resolved = resolveDimensionValues(path, definitions, []);
    assert.deepEqual(resolved, {
      "dim-produto": "Produto",
      front: "Frente",
      process: "Processo",
    });
  });

  it("TESTE 5: sem config de Processo não inventa processo", () => {
    const definitions = defsForPlan("PlanTest", [{ columnName: "Frente", sourceLevel: "1" }]);
    const resolved = resolveDimensionValues(genericPath, definitions, []);
    assert.equal(resolved.front, "Frente/Feature");
    assert.equal(resolved.process, undefined);
  });

  it("TESTE 6: configuração explícita vence heurística", () => {
    const path = { pathNames: ["Prioridade 0", "Suite folha"], currentSuiteName: "Suite folha" };
    const definitions = defsForPlan("PlanTest", [{ columnName: "Frente", sourceLevel: "1" }]);
    const suggestions = detectDimensions([{ ancestors: path.pathNames.map((name) => ({ name })) }]);
    const resolved = resolveDimensionValues(path, definitions, suggestions);
    assert.equal(resolved.front, "Prioridade 0");
    assert.equal(resolved.priority, undefined);
  });

  it("TESTE 7: caso SIAS legado continua com Prioridade sugerida", () => {
    const siasPath = {
      pathNames: ["Prioridade 0", "04 02 06 - GEMCO/GERORJ - Exemplo"],
      currentSuiteName: "04 02 06 - GEMCO/GERORJ - Exemplo",
    };
    const suggestions = detectDimensions([{ ancestors: siasPath.pathNames.map((name) => ({ name })) }]);
    const resolved = resolveDimensionValues(siasPath, [], suggestions);
    const legacy = valuesForPath(siasPath.pathNames.map((name) => ({ name })), suggestions);
    assert.deepEqual(resolved, legacy);
    assert.equal(resolved.priority, "Prioridade 0");
    assert.equal(resolved.process, undefined);
    assert.equal(legacyRoleValue("process", resolved, [], suggestions), "");
  });

  it("TESTE 8: 5 processos x 5 CTs com Processo resolvido", () => {
    const definitions = defsForPlan("PlanTest", [
      { columnName: "Frente", sourceLevel: "1" },
      { columnName: "Processo", sourceType: "current_suite" },
    ]);
    let resolvedCount = 0;
    for (let n = 1; n <= 5; n += 1) {
      const processo = `Processo/Function ${n}`;
      for (let ct = 0; ct < 5; ct += 1) {
        const ctx = { pathNames: ["Frente/Feature", processo], currentSuiteName: processo };
        const resolved = resolveDimensionValues(ctx, definitions, []);
        assert.equal(resolved.front, "Frente/Feature");
        assert.equal(resolved.process, processo);
        resolvedCount += 1;
      }
    }
    assert.equal(resolvedCount, 25);
  });

  it("configuração por PlanKey não vaza para outro plano", () => {
    const entries = [
      {
        order: 1,
        columnName: "Processo",
        sourceLevel: "2",
        active: true,
        planKey: "PlanA",
        sourceType: "current_suite" as const,
      },
    ];
    assert.equal(dimensionDefinitionsForPlan("PlanB", entries).length, 0);
    assert.equal(dimensionDefinitionsForPlan("PlanA", entries).length, 1);
  });
});

describe("inferDimensions", () => {
  it("dados legados com Prioridade N não aparecem como Frente", () => {
    const dims = inferDimensions([{ frente: "Prioridade 0" }, { frente: "Prioridade 1" }]);
    assert.equal(dims[0]?.label, "Prioridade");
  });

  it("frente legada sem padrão fica como Nível 1", () => {
    const dims = inferDimensions([{ frente: "Atendimento" }]);
    assert.equal(dims[0]?.label, "Nível 1");
    assert.equal(dims[0]?.role, "generic");
  });
});
