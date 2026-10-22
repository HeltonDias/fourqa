import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { explicitPlanKeyFromQuery, planKeyFromRaw, planKeyWriteError, requiredPlanKey } from "./planKey.js";

describe("planKey da listagem", () => {
  it("ausente, vazio ou só espaços usa o plano padrão", () => {
    assert.equal(planKeyFromRaw(undefined, "PlanTeste"), "PlanTeste");
    assert.equal(planKeyFromRaw("", "PlanTeste"), "PlanTeste");
    assert.equal(planKeyFromRaw("   ", "PlanTeste"), "PlanTeste");
  });

  it("chave preenchida é normalizada e uma chave inexistente segue para o filtro", () => {
    assert.equal(planKeyFromRaw(" EndToEnd ", "PlanTeste"), "EndToEnd");
    assert.equal(planKeyFromRaw("Inexistente", "PlanTeste"), "Inexistente");
  });

  it("escrita exige planKey explícito", () => {
    assert.equal(explicitPlanKeyFromQuery(undefined), null);
    assert.equal(explicitPlanKeyFromQuery(""), null);
    assert.equal(explicitPlanKeyFromQuery("   "), null);
    assert.equal(explicitPlanKeyFromQuery(["A", "B"]), null);
    assert.equal(explicitPlanKeyFromQuery(" EndToEnd "), "EndToEnd");
    assert.equal(planKeyWriteError(undefined), "Informe o planKey.");
    assert.equal(planKeyWriteError(["A", "B"]), "planKey ambíguo.");
  });

  it("recusa paginar sem plano", () => {
    assert.throws(() => requiredPlanKey(undefined), /planKey obrigatório/);
    assert.throws(() => requiredPlanKey(""), /planKey obrigatório/);
    assert.throws(() => requiredPlanKey("   "), /planKey obrigatório/);
    assert.throws(() => planKeyFromRaw("", "  "), /planKey obrigatório/);
  });
});
