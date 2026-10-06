import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { statusEvolucao, statusGeralDe } from "./evolucaoStatus.js";

function face(partial: Partial<Parameters<typeof statusEvolucao>[0]>) {
  return statusEvolucao({
    gap: 0,
    ttlCts: 10,
    finalizados: 4,
    na: 0,
    ...partial,
  });
}

describe("statusEvolucao", () => {
  it("todos N/A fica cinza, mesmo com GAP zerado", () => {
    assert.equal(face({ na: 10, finalizados: 10, gap: 0 }), "na");
  });

  it("todos finalizados vira check, e N/A parcial não impede", () => {
    assert.equal(face({ finalizados: 10, na: 2, gap: 0 }), "done");
    assert.equal(face({ finalizados: 10, na: 0, gap: 4 }), "done");
  });

  it("GAP acima de 3 é vermelho e GAP maior que 0 e menor que 3 é amarelo", () => {
    assert.equal(face({ gap: 3.1 }), "risk");
    assert.equal(face({ gap: 4 }), "risk");
    assert.equal(face({ gap: 2.9 }), "warn");
    assert.equal(face({ gap: 1 }), "warn");
    assert.equal(face({ gap: 3 }), "warn");
  });

  it("GAP zerado sem fechar todos os cenários é verde", () => {
    assert.equal(face({ gap: 0, finalizados: 4 }), "ok");
    assert.equal(face({ gap: -1, finalizados: 9 }), "ok");
  });
});

describe("statusGeralDe", () => {
  it("a maioria finalizada usa o check e só N/A usa o cinza", () => {
    assert.equal(statusGeralDe(["done", "done", "warn", "risk"]), "done");
    assert.equal(statusGeralDe(["na", "na"]), "na");
  });

  it("empate fica com o mais grave", () => {
    assert.equal(statusGeralDe(["ok", "warn"]), "warn");
    assert.equal(statusGeralDe(["warn", "risk"]), "risk");
  });
});
