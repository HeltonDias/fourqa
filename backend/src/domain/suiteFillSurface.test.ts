import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function source(relative: string): string {
  return readFileSync(path.join(root, relative), "utf8");
}

describe("superfície de responsável e prioridade", () => {
  it("mostra prioridade editável só no Planejar e responsável só no Acompanhamento", () => {
    const grid = source("frontend/src/components/planning/PlanningGridTable.tsx");
    const track = source("frontend/src/components/planning/PlanningAcompanhamentoTable.tsx");
    assert.match(grid, /Prioridade própria da suíte/);
    assert.equal(grid.includes("Responsável próprio da suíte"), false);
    assert.match(grid, /onSave\(item, "prioridade"/);
    assert.equal(grid.includes('onSave(item, "responsavel"'), false);
    assert.match(grid, /item\.suiteId == null \? \(\s*"—"\s*\) : \(/);
    assert.match(track, /Responsável próprio da suíte/);
    assert.match(track, /Prioridade própria da suíte, somente leitura nesta visão/);
    assert.match(track, /onSave\(item, "responsavel"/);
    assert.equal(track.includes('onSave(item, "prioridade"'), false);
    assert.match(track, /item\.suiteId == null \? "—" : item\.prioridade \|\| "—"/);
  });

  it("mantém a prioridade do Test Case em Execuções e fora das outras páginas", () => {
    const execucoes = source("frontend/src/pages/ExecucoesPage.tsx");
    assert.match(execucoes, /case_priority/);
    assert.equal(execucoes.includes("Prioridade própria da suíte"), false);
    for (const page of [
      "frontend/src/pages/StatusPage.tsx",
      "frontend/src/pages/ReportPage.tsx",
      "frontend/src/pages/FalhasPage.tsx",
      "frontend/src/pages/MaintenancePage.tsx",
      "frontend/src/pages/ExecucoesPage.tsx",
    ]) {
      const text = source(page);
      assert.equal(text.includes("Responsável próprio da suíte"), false, page);
      assert.equal(text.includes("Prioridade própria da suíte"), false, page);
    }
  });
});
