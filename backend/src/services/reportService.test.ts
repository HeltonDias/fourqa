import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { getDb } from "../db.js";
import { sqliteLegacyPlanStore } from "../db/sqliteLegacyPlanStore.js";
import { sqliteMetaStore } from "../db/sqliteMetaStore.js";
import { getHome, getStatusPorFrente } from "./reportService.js";

const dir = mkdtempSync(path.join(tmpdir(), "fourqa-report-"));
process.env.FOURQA_DB = path.join(dir, "fourqa.db");

const PERIODO_INICIO = "2026-10-12";
const PERIODO_FIM = "2026-11-12";
const LEGADO_INICIO = "2026-12-01";
const LEGADO_FIM = "2026-12-10";

async function suiteOf(planKey: string) {
  const home = await getHome(planKey);
  assert.equal(home.suites.length, 1);
  return { home, suite: home.suites[0]! };
}

describe("isolamento do legado no Report", { concurrency: 1 }, () => {
  before(() => {
    const db = getDb();
    sqliteMetaStore.set("data_inicio", PERIODO_INICIO);
    sqliteMetaStore.set("data_fim", PERIODO_FIM);
    db.prepare(
      `INSERT INTO planejamento_linhas
        (row_num, qa, prioridades, frente, processo, data_inicio, data_fim, replanejamento, qtd_cts_plan, cts_cancelados)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(1, "QA Legado", "P1-LEGADO", "FRENTE-LEGADO", "Cadastro", LEGADO_INICIO, LEGADO_FIM, 7, 99, 4);

    const insertExec = db.prepare(
      `INSERT INTO execucoes (plan_key, suite_id, suite_name, frente, test_point_id, outcome)
       VALUES (?, ?, 'Cadastro', 'FRENTE-AZURE', ?, 'Passed')`,
    );
    insertExec.run("LegadoA", 1, 101);
    insertExec.run("LegadoA", 1, 102);
    insertExec.run("NovoB", 2, 201);
    insertExec.run("NovoB", 2, 202);
    insertExec.run("NovoB", 2, 203);
  });

  after(() => {
    getDb().close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("sem planejamento_legado_plan_key, nenhum Report recebe o legado", async () => {
    assert.equal(sqliteLegacyPlanStore.listBase().some((row) => row.processo === "Cadastro"), true);
    for (const planKey of ["LegadoA", "NovoB"]) {
      const { suite } = await suiteOf(planKey);
      assert.equal(suite.qa, null);
      assert.equal(suite.prioridades, null);
      assert.equal(suite.replanejamento, 0);
      assert.equal(suite.cts_cancelados, 0);
      assert.equal(suite.data_inicio, PERIODO_INICIO);
      assert.equal(suite.data_fim, PERIODO_FIM);
      assert.equal(suite.planejamentoOrigem, "periodo_plano");
      assert.equal(suite.frente, "FRENTE-AZURE");
    }
  });

  it("meta vazia também deixa a base legada fora do Report", async () => {
    sqliteMetaStore.set("planejamento_legado_plan_key", "   ");
    const { suite } = await suiteOf("LegadoA");
    assert.equal(suite.qa, null);
    assert.equal(suite.cts_cancelados, 0);
    assert.equal(suite.data_inicio, PERIODO_INICIO);
    assert.equal(suite.planejamentoOrigem, "periodo_plano");
  });

  it("o plano dono usa o legado e outro PlanKey com o mesmo processo não usa", async () => {
    sqliteMetaStore.set("planejamento_legado_plan_key", "legadoa");

    const dono = await suiteOf("LegadoA");
    assert.equal(dono.suite.qa, "QA Legado");
    assert.equal(dono.suite.prioridades, "P1-LEGADO");
    assert.equal(dono.suite.replanejamento, 7);
    assert.equal(dono.suite.cts_cancelados, 4);
    assert.equal(dono.suite.data_inicio, LEGADO_INICIO);
    assert.equal(dono.suite.data_fim, LEGADO_FIM);
    assert.equal(dono.suite.planejamentoOrigem, "confirmado");
    assert.equal(dono.suite.frente, "FRENTE-AZURE");
    assert.equal(dono.home.replanejamentoTotal, 7);

    const outro = await suiteOf("NovoB");
    assert.equal(outro.suite.qa, null);
    assert.equal(outro.suite.prioridades, null);
    assert.equal(outro.suite.replanejamento, 0);
    assert.equal(outro.suite.cts_cancelados, 0);
    assert.equal(outro.suite.data_inicio, PERIODO_INICIO);
    assert.equal(outro.suite.data_fim, PERIODO_FIM);
    assert.equal(outro.suite.planejamentoOrigem, "periodo_plano");
    assert.equal(outro.suite.frente, "FRENTE-AZURE");
    assert.equal(outro.home.replanejamentoTotal, 0);
    assert.equal(JSON.stringify(outro.home).includes("QA Legado"), false);
    assert.equal(JSON.stringify(outro.home).includes("P1-LEGADO"), false);
    assert.equal(JSON.stringify(outro.home).includes("FRENTE-LEGADO"), false);
  });

  it("contagens de execução continuam as do Azure, sem a quantidade legada", async () => {
    sqliteMetaStore.set("planejamento_legado_plan_key", "LegadoA");

    const dono = await suiteOf("LegadoA");
    assert.equal(dono.suite.qtd_cts_plan, 2);
    assert.equal(dono.suite.ttlCts, 2);
    assert.equal(dono.suite.cts_passeds, 2);
    assert.equal(dono.home.ttlCts, 2);
    assert.equal(dono.home.totais.ctsPlan, 2);
    assert.equal(dono.home.totais.passeds, 2);
    assert.equal(dono.suite.total_realizado, 2);
    assert.equal(dono.suite.cts_cancelados, 4);
    assert.equal(dono.suite.gap, (dono.suite.cts_plan_dia ?? 0) - 2);
    assert.equal(dono.home.totais.totalRealizado, 2);
    assert.equal(dono.home.percentuais.real, 1);
    assert.equal(dono.suite.status, "done");

    const outro = await suiteOf("NovoB");
    assert.equal(outro.suite.qtd_cts_plan, 3);
    assert.equal(outro.suite.ttlCts, 3);
    assert.equal(outro.suite.cts_passeds, 3);
    assert.equal(outro.suite.cts_cancelados, 0);
    assert.equal(outro.home.ttlCts, 3);
    assert.equal(outro.home.totais.ctsPlan, 3);
    assert.equal(outro.home.totais.passeds, 3);
    assert.equal(outro.suite.total_realizado, 3);
    assert.notEqual(outro.suite.qtd_cts_plan, 99);
  });

  it("plano sem execuções zera Total, Finalizados, Pendentes e % REAL", async () => {
    const home = await getHome("PlanoVazio");
    assert.equal(home.suites.length, 0);
    assert.equal(home.ttlCts, 0);
    assert.equal(home.totais.totalRealizado, 0);
    assert.equal(home.ttlCts - home.totais.totalRealizado, 0);
    assert.equal(home.percentuais.real, 0);
    assert.equal(home.percentuais.plan, 0);
    assert.equal(home.gap, 0);
    assert.equal(home.statusGeral, "ok");
  });

  it("separa Finalizados do Report, cancelados e a conta antiga da aba Status", async () => {
    const db = getDb();
    sqliteMetaStore.set("planejamento_legado_plan_key", "IsoStatus");
    sqliteMetaStore.set(
      "dimensoes_catalog:IsoStatus",
      JSON.stringify([
        {
          key: "front",
          label: "Frente",
          level: 1,
          values: ["FRENTE-ISO"],
          role: "front",
          confidence: 0.9,
          visible: true,
        },
      ]),
    );
    db.prepare(
      `INSERT INTO planejamento_linhas
        (row_num, qa, prioridades, frente, processo, data_inicio, data_fim, replanejamento, qtd_cts_plan, cts_cancelados)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(20, "QA Iso", "P-ISO", "FRENTE-ISO", "SuiteIso", "2026-09-07", "2026-09-11", 0, 7, 2);

    const insert = db.prepare(
      `INSERT INTO execucoes
        (plan_key, suite_id, suite_name, frente, test_point_id, outcome, test_case_state, test_point_state)
       VALUES (?, 20, 'SuiteIso', 'FRENTE-ISO', ?, ?, ?, ?)`,
    );
    insert.run("IsoStatus", 1, "Passed", "Closed", "Completed");
    insert.run("IsoStatus", 2, "Passed", "QA", "Completed");
    insert.run("IsoStatus", 3, "NotApplicable", "Closed", "Completed");
    insert.run("IsoStatus", 4, "Failed", "BUG", "Completed");
    insert.run("IsoStatus", 5, "Blocked", "QA", "Completed");
    insert.run("IsoStatus", 6, "", "Design", "NotReady");
    insert.run("IsoStatus", 7, "", "QA", "Ready");
    insert.run("IsoStatus", 8, "", "QA", "NotReady");

    const home = await getHome("IsoStatus");
    assert.equal(home.suites.length, 1);
    const suite = home.suites[0]!;
    const detalhe =
      suite.cts_passeds +
      suite.cts_na +
      suite.cts_falhados +
      suite.cts_bloqueados +
      suite.cts_liberados +
      suite.cts_nao_liberados +
      suite.cts_design;
    assert.equal(suite.ttlCts, 8);
    assert.equal(detalhe, 8);
    assert.equal(suite.cts_passeds, 2);
    assert.equal(suite.cts_na, 1);
    assert.equal(suite.total_realizado, 3);
    assert.equal(suite.ttlCts - suite.total_realizado, 5);
    assert.equal(suite.cts_cancelados, 2);
    assert.equal(suite.cts_plan_dia, 8);
    assert.equal(suite.gap, 5);
    assert.equal(suite.status, "risk");
    assert.equal(home.percentuais.real, 3 / 8);
    assert.equal(home.totais.passeds, 2);
    assert.equal(home.totais.na, 1);
    assert.equal(home.totais.cancelados, 2);
    assert.equal(home.percentBugsDev, 0);
    assert.equal(home.percentBugsCliente, 0);

    const status = await getStatusPorFrente("IsoStatus");
    const bloco = status.blocos.find((item) => item.frente === "FRENTE-ISO");
    assert.ok(bloco);
    assert.equal(bloco.cenarios.finalizado, 5);
    assert.equal(bloco.cenarios.passeds, 2);
    assert.equal(bloco.cenarios.na, 1);
    assert.equal(bloco.indicadores.pctReal, 5 / 8);
    assert.equal(bloco.indicadores.gap, 3);
    assert.equal(bloco.indicadores.status, "warn");
  });
});
