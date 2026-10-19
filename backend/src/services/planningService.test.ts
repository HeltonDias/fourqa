import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { getDb, getDbPath } from "../db.js";
import { sqliteMetaStore } from "../db/sqliteMetaStore.js";
import { getPlanningView } from "./planningService.js";

const dir = mkdtempSync(path.join(tmpdir(), "four-qa-plan-"));
process.env.FOURQA_DB = path.join(dir, "fourqa.db");

function revisionCount(planKey: string): number {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS n
       FROM planning_revision r
       JOIN planning p ON p.id = r.planning_id
       WHERE p.plan_key = ?`,
    )
    .get(planKey) as { n: number };
  return row.n;
}

describe("isolamento do planejamento legado por PlanKey", { concurrency: 1 }, () => {
  before(() => {
    assert.equal(getDbPath(), process.env.FOURQA_DB);
    const db = getDb();
    sqliteMetaStore.set("data_inicio", "2026-10-12");
    sqliteMetaStore.set("data_fim", "2026-11-12");
    db.prepare(
      `INSERT INTO planejamento_linhas
        (row_num, frente, processo, qtd_cts_plan, data_inicio, data_fim, cts_cancelados, replanejamento)
       VALUES (?, ?, ?, ?, ?, ?, 0, 0)`,
    ).run(1, "GESIN", "Cadastro de Protocolo", 4, "2026-10-12", "2026-11-12");
    db.prepare(
      `INSERT INTO planejamento_linhas
        (row_num, frente, processo, qtd_cts_plan, data_inicio, data_fim, cts_cancelados, replanejamento)
       VALUES (?, ?, ?, ?, ?, ?, 0, 0)`,
    ).run(2, "GERORJ", "40 - CONFERIR BAIXA NO SIAS", 6, "2026-10-12", "2026-11-12");
    db.prepare(
      `INSERT INTO planejamento_linhas (row_num, processo, qtd_cts_plan) VALUES (?, ?, ?)`,
    ).run(3, "Valores Totais >>>>>>>", 91);

    const insertExec = db.prepare(
      `INSERT INTO execucoes (plan_key, plan_id, suite_id, suite_name, test_point_id, test_case_id, dimensions_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    insertExec.run("EndToEnd", 86730, 201, "Suite Azure EndToEnd", 501, 501, "{}");
    for (let i = 0; i < 3; i += 1) {
      insertExec.run(
        "PlanTeste",
        93551,
        101,
        "Processo/Function 1",
        1001 + i,
        1001 + i,
        JSON.stringify({ front: "Frente/Feature 1", process: "Processo/Function 1" }),
      );
    }
    for (let i = 0; i < 2; i += 1) {
      insertExec.run(
        "PlanTeste",
        93551,
        102,
        "Processo/Function 2",
        2001 + i,
        2001 + i,
        JSON.stringify({ front: "Frente/Feature 2", process: "Processo/Function 2" }),
      );
    }
  });

  after(() => {
    getDb().close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("legado sem planejamento_legado_plan_key não é aplicado a nenhum plano", async () => {
    for (const planKey of ["EndToEnd", "PlanTeste"]) {
      const view = await getPlanningView(planKey);
      const blob = JSON.stringify(view.items);
      assert.equal(view.revision?.baselineOrigin === "legacy", false);
      assert.equal(blob.includes("GESIN"), false);
      assert.equal(blob.includes("GERORJ"), false);
      assert.equal(blob.includes("Cadastro de Protocolo"), false);
    }
  });

  it("plano legado continua usando a base da planilha quando o dono está gravado", async () => {
    sqliteMetaStore.set("planejamento_legado_plan_key", "EndToEnd");
    const view = await getPlanningView("EndToEnd");
    assert.equal(view.planning.planKey, "EndToEnd");
    assert.equal(view.revision?.baselineOrigin, "legacy");
    assert.equal(view.revision?.scopeSnapshotAvailable, false);
    assert.equal(view.summary.baselineCount, 10);
    assert.equal(view.summary.sourceCount, 1);
    const names = view.items.map((item) => item.suiteName);
    assert.deepEqual(names.sort(), ["40 - CONFERIR BAIXA NO SIAS", "Cadastro de Protocolo"]);
    assert.ok(view.items.some((item) => item.dimensions.frente === "GESIN"));
    assert.ok(view.items.some((item) => item.dimensions.frente === "GERORJ"));
    assert.equal(view.items.some((item) => /valores\s+totais/i.test(item.suiteName)), false);
  });

  it("plano novo com execuções não usa o legado de outro PlanKey", async () => {
    const before = revisionCount("EndToEnd");
    const view = await getPlanningView("PlanTeste");
    assert.equal(revisionCount("EndToEnd"), before);
    assert.equal(revisionCount("PlanTeste"), 0);
    assert.equal(view.revision?.baselineOrigin, "ausente");
    assert.equal(view.revision?.version, null);
    assert.equal(view.editable, false);
    assert.equal(view.summary.sourceCount, 5);
    assert.equal(view.summary.baselineCount, 0);
    assert.ok(view.items.every((item) => item.baselineCount == null));
    assert.ok(view.items.every((item) => item.sourceCount != null && item.sourceCount > 0));
  });

  it("PlanTeste retorna somente as próprias suítes, sem GESIN/GERORJ", async () => {
    const view = await getPlanningView("PlanTeste");
    const names = view.items.map((item) => item.suiteName).sort();
    assert.deepEqual(names, ["Processo/Function 1", "Processo/Function 2"]);
    const blob = JSON.stringify(view.items);
    assert.equal(blob.includes("GESIN"), false);
    assert.equal(blob.includes("GERORJ"), false);
    assert.equal(blob.includes("Cadastro de Protocolo"), false);
    assert.equal(blob.includes("CONFERIR BAIXA"), false);
    const byName = new Map(view.items.map((item) => [item.suiteName, item.sourceCount]));
    assert.equal(byName.get("Processo/Function 1"), 3);
    assert.equal(byName.get("Processo/Function 2"), 2);
  });

  it("troca de PlanKey não reutiliza revisão de outro plano e o sourceScope permanece do plano pedido", async () => {
    const db = getDb();
    const planningId = Number(
      db.prepare("INSERT INTO planning (plan_key, created_at) VALUES (?, ?)").run("EndToEnd", "2026-10-06T18:00:00.000Z")
        .lastInsertRowid,
    );
    const revisionId = Number(
      db.prepare(
        `INSERT INTO planning_revision (planning_id, version, created_at, reason, baseline_origin, scope_snapshot)
         VALUES (?, 7, ?, ?, 'motor', 1)`,
      ).run(planningId, "2026-10-06T18:00:00.000Z", "baseline endtoend").lastInsertRowid,
    );
    db.prepare(
      `INSERT INTO planning_scope_item (revision_id, plan_id, suite_id, test_point_id, test_case_id, label)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(revisionId, 86730, 900, 9001, 9001, "Somente EndToEnd");
    db.prepare(
      `INSERT INTO planning_item (revision_id, suite_id, suite_name, baseline_quantity) VALUES (?, ?, ?, ?)`,
    ).run(revisionId, 900, "Somente EndToEnd", 1);

    const endToEndRevisions = revisionCount("EndToEnd");
    const planTeste = await getPlanningView("PlanTeste");
    assert.equal(revisionCount("EndToEnd"), endToEndRevisions);
    assert.equal(revisionCount("PlanTeste"), 0);
    assert.equal(planTeste.revisions.length, 0);
    assert.equal(planTeste.revision?.version, null);
    assert.equal(planTeste.summary.sourceCount, 5);
    assert.equal(JSON.stringify(planTeste.items).includes("Somente EndToEnd"), false);

    const endToEnd = await getPlanningView("EndToEnd");
    assert.equal(endToEnd.planning.planKey, "EndToEnd");
    assert.equal(endToEnd.revision?.version, 7);
    assert.equal(endToEnd.revision?.baselineOrigin, "motor");
    assert.deepEqual(
      endToEnd.revisions.map((row) => row.version),
      [7],
    );
    assert.equal(endToEnd.summary.sourceCount, 1);
    assert.ok(endToEnd.items.some((item) => item.suiteName === "Somente EndToEnd"));
    assert.equal(endToEnd.items.some((item) => item.suiteName === "Processo/Function 1"), false);
  });

  it("o planejamento legado continua incluindo cancelados no finalizado", async () => {
    const db = getDb();
    db.prepare(
      `INSERT INTO planejamento_linhas
        (row_num, frente, processo, qtd_cts_plan, data_inicio, data_fim, cts_cancelados, replanejamento)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(90, "FRENTE-PLAN", "Suite Plan Canc", 1, "2026-09-07", "2026-09-11", 5, 0);
    db.prepare(
      `INSERT INTO execucoes (plan_key, suite_id, suite_name, test_point_id, outcome)
       VALUES (?, ?, ?, ?, ?)`,
    ).run("PlanCanc", 90, "Suite Plan Canc", 9001, "Passed");
    sqliteMetaStore.set("planejamento_legado_plan_key", "PlanCanc");

    const view = await getPlanningView("PlanCanc");
    assert.equal(view.revision?.baselineOrigin, "legacy");
    assert.equal(view.summary.finalizedCount, 6);

    sqliteMetaStore.set("planejamento_legado_plan_key", "EndToEnd");
  });

  it("resolução do legado não usa nome de plano como fallback", () => {
    const source = readFileSync(new URL("./planningService.ts", import.meta.url), "utf8");
    const start = source.indexOf("function legacyBaseForPlan");
    const end = source.indexOf("function catalog");
    assert.ok(start >= 0 && end > start);
    const resolution = source.slice(start, end);
    assert.equal(/EndToEnd|PlanTeste|DEFAULT_PLAN_KEY/.test(resolution), false);
    assert.match(resolution, /planejamento_legado_plan_key/);
  });
});
