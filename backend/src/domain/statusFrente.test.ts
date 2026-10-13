import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { haSobreposicaoFrentes, indicadoresFrente, type FrenteContagens } from "./statusFrente.js";

function contagens(partial: Partial<FrenteContagens> = {}): FrenteContagens {
  return {
    ttl: 10,
    planAteHoje: 6,
    finalizado: 4,
    na: 0,
    passeds: 3,
    falha: 1,
    bloqueado: 1,
    impactosDev: 2,
    impactosCliente: 1,
    bugsTotal: 5,
    bugsFechados: 2,
    ...partial,
  };
}

describe("indicadoresFrente", () => {
  it("calcula gap, percentuais e bugs abertos sem reclassificar execução", () => {
    const ind = indicadoresFrente(contagens());
    assert.equal(ind.gap, 2);
    assert.equal(ind.pctPlan, 0.6);
    assert.equal(ind.pctReal, 0.4);
    assert.equal(ind.pctBugsDev, 2 / 5);
    assert.equal(ind.pctBugsCliente, 1 / 5);
    assert.equal(ind.bugsAbertos, 3);
    assert.equal(ind.status, "warn");
  });

  it("marca risco quando o gap passa de 3 e a frente não está finalizada", () => {
    assert.equal(indicadoresFrente(contagens({ planAteHoje: 9, finalizado: 4 })).status, "risk");
  });

  it("marca finalizado quando os itens realizados cobrem o total", () => {
    assert.equal(indicadoresFrente(contagens({ finalizado: 10, planAteHoje: 10 })).status, "done");
  });

  it("zera percentuais quando não há denominador", () => {
    const ind = indicadoresFrente(
      contagens({ ttl: 0, passeds: 0, falha: 0, bloqueado: 0, impactosDev: 4, finalizado: 0, planAteHoje: 0 }),
    );
    assert.equal(ind.pctPlan, 0);
    assert.equal(ind.pctReal, 0);
    assert.equal(ind.pctBugsDev, 0);
    assert.equal(ind.status, "ok");
  });
});

describe("haSobreposicaoFrentes", () => {
  it("detecta nome contido em outro, independente do rótulo do projeto", () => {
    assert.equal(haSobreposicaoFrentes(["Norte", "Norte Sul"]), true);
    assert.equal(haSobreposicaoFrentes(["Norte", "Sul"]), false);
    assert.equal(haSobreposicaoFrentes([]), false);
  });
});
