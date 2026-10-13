import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isLegacyPlanOwner } from "./legacyPlanOwner.js";

describe("dono do planejamento legado", () => {
  it("reconhece o plano gravado, ignorando caixa e espaços", () => {
    assert.equal(isLegacyPlanOwner("LegadoA", "legadoa"), true);
    assert.equal(isLegacyPlanOwner(" LegadoA ", "  legadoa  "), true);
  });

  it("recusa meta ausente, vazia ou de outro plano", () => {
    assert.equal(isLegacyPlanOwner("LegadoA", null), false);
    assert.equal(isLegacyPlanOwner("LegadoA", undefined), false);
    assert.equal(isLegacyPlanOwner("LegadoA", ""), false);
    assert.equal(isLegacyPlanOwner("LegadoA", "   "), false);
    assert.equal(isLegacyPlanOwner("NovoB", "LegadoA"), false);
    assert.equal(isLegacyPlanOwner("", ""), false);
  });
});
