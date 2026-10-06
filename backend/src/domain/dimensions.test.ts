import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyHierarchyOverrides, detectDimensions, inferDimensions } from "./dimensions.js";

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
