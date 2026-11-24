import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { distributionPreview } from "../src/components/planning/distributionPreview.ts";

describe("distributionPreview", () => {
  it("célula vazia digitando 1 soma a diferença", () => {
    const preview = distributionPreview(4, 0, "1");
    assert.equal(preview.delta, 1);
    assert.equal(preview.after, 5);
    assert.equal(preview.text, "4 + 1 = 5");
  });

  it("diminuir célula salva em 1 mostra a subtração", () => {
    const preview = distributionPreview(4, 1, "0");
    assert.equal(preview.delta, -1);
    assert.equal(preview.after, 3);
    assert.equal(preview.text, "4 - 1 = 3");
  });

  it("trocar célula salva em 1 por 2 soma só o acréscimo", () => {
    const preview = distributionPreview(4, 1, "2");
    assert.equal(preview.delta, 1);
    assert.equal(preview.after, 5);
    assert.equal(preview.text, "4 + 1 = 5");
  });

  it("delta zero mostra só o total salvo", () => {
    assert.equal(distributionPreview(4, 1, "1").text, "4");
  });

  it("rascunho vazio vale zero", () => {
    assert.equal(distributionPreview(4, 0, "").text, "4");
    assert.equal(distributionPreview(4, 3, "").text, "4 - 3 = 1");
  });

  it("troca o inteiro salvo por outro e ignora a quantidade planejada", () => {
    const preview = distributionPreview(4, 0, "2");
    assert.equal(preview.text, "4 + 2 = 6");
    assert.equal(distributionPreview(4, 3, "1").text, "4 - 2 = 2");
  });
});
