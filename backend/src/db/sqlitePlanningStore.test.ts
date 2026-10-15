import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { getDb } from "../db.js";
import { sqlitePlanningStore, type CommitRevisionInput, type PlanningItemWrite } from "./sqlitePlanningStore.js";

const dir = mkdtempSync(path.join(tmpdir(), "fourqa-plan-store-"));
process.env.FOURQA_DB = path.join(dir, "fourqa.db");

function tableCount(table: string): number {
  const row = getDb().prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number };
  return row.n;
}

function item(partial: Partial<PlanningItemWrite> = {}): PlanningItemWrite {
  return {
    suiteId: 10,
    suiteName: "Cadastro",
    plannedStart: "2026-10-12",
    plannedEnd: "2026-10-20",
    baselineQuantity: 2,
    allocations: [{ date: "2026-10-13", quantity: 2 }],
    ...partial,
  };
}

function revisionInput(partial: Partial<CommitRevisionInput> = {}): CommitRevisionInput {
  return {
    planKey: "PlanoA",
    createdAt: "2026-10-08T15:00:00.000Z",
    version: 1,
    reason: "baseline A",
    baselineOrigin: "motor",
    scopeSnapshot: 1,
    scope: [{ planId: 1, suiteId: 10, testPointId: 100, testCaseId: 200, label: "CT A" }],
    items: [item()],
    ...partial,
  };
}

describe("SqlitePlanningStore", { concurrency: 1 }, () => {
  after(() => {
    getDb().close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("falha no meio da transação desfaz planning, revisão, escopo, item e alocação", () => {
    assert.throws(() =>
      sqlitePlanningStore.commitRevision(
        revisionInput({
          items: [
            item({
              allocations: [
                { date: "2026-10-13", quantity: 1 },
                { date: "2026-10-13", quantity: 2 },
              ],
            }),
          ],
        }),
      ),
    );
    assert.equal(tableCount("planning"), 0);
    assert.equal(tableCount("planning_revision"), 0);
    assert.equal(tableCount("planning_scope_item"), 0);
    assert.equal(tableCount("planning_item"), 0);
    assert.equal(tableCount("planning_allocation"), 0);
  });

  it("commitRevision grava planning, revisão, escopo, item e alocação juntos", () => {
    const revisionId = sqlitePlanningStore.commitRevision(revisionInput());
    assert.equal(tableCount("planning"), 1);
    assert.equal(tableCount("planning_revision"), 1);
    assert.equal(tableCount("planning_scope_item"), 1);
    assert.equal(tableCount("planning_item"), 1);
    assert.equal(tableCount("planning_allocation"), 1);

    const scope = sqlitePlanningStore.loadScope(revisionId);
    assert.deepEqual(scope, [{ planId: 1, suiteId: 10, testPointId: 100, testCaseId: 200, label: "CT A" }]);

    const schedule = sqlitePlanningStore.loadSchedule(revisionId);
    assert.equal(schedule.length, 1);
    assert.equal(schedule[0]?.suiteId, 10);
    assert.equal(schedule[0]?.suiteName, "Cadastro");
    assert.equal(schedule[0]?.plannedStart, "2026-10-12");
    assert.equal(schedule[0]?.plannedEnd, "2026-10-20");
    assert.equal(schedule[0]?.baselineQuantity, 2);
    assert.deepEqual(schedule[0]?.allocations, [{ date: "2026-10-13", quantity: 2 }]);
  });

  it("latestRevision e revisionByVersion não cruzam PlanKey", () => {
    sqlitePlanningStore.commitRevision(
      revisionInput({
        planKey: "PlanoB",
        version: 1,
        reason: "baseline B",
        scope: [{ planId: 2, suiteId: 20, testPointId: 300, testCaseId: 400, label: "CT B" }],
        items: [item({ suiteId: 20, suiteName: "Outro", allocations: [{ date: "2026-10-14", quantity: 1 }] })],
      }),
    );
    sqlitePlanningStore.commitRevision(revisionInput({ planKey: "PlanoA", version: 2, reason: "revisão A" }));

    const latestA = sqlitePlanningStore.latestRevision("PlanoA");
    const latestB = sqlitePlanningStore.latestRevision("PlanoB");
    assert.equal(latestA?.version, 2);
    assert.equal(latestA?.reason, "revisão A");
    assert.equal(latestB?.version, 1);
    assert.equal(latestB?.reason, "baseline B");
    assert.notEqual(latestA?.id, latestB?.id);

    const versionOneA = sqlitePlanningStore.revisionByVersion("PlanoA", 1);
    const versionOneB = sqlitePlanningStore.revisionByVersion("PlanoB", 1);
    assert.equal(versionOneA?.reason, "baseline A");
    assert.equal(versionOneB?.reason, "baseline B");
    assert.notEqual(versionOneA?.id, versionOneB?.id);
    assert.equal(sqlitePlanningStore.revisionByVersion("PlanoA", 9), null);
    assert.deepEqual(
      sqlitePlanningStore.listRevisions("PlanoA").map((row) => row.version),
      [1, 2],
    );
    assert.deepEqual(
      sqlitePlanningStore.loadScope(versionOneB?.id ?? 0).map((row) => row.label),
      ["CT B"],
    );
  });

  it("saveCell remove alocação com quantidade 0 e grava quantidade positiva", () => {
    const revision = sqlitePlanningStore.latestRevision("PlanoA");
    const saved = sqlitePlanningStore.loadSchedule(revision?.id ?? 0);
    const itemId = saved[0]?.id ?? 0;

    sqlitePlanningStore.saveCell({ itemId, field: "day", date: "2026-10-15", quantity: 4 });
    const withDay = sqlitePlanningStore.loadSchedule(revision?.id ?? 0)[0];
    assert.deepEqual(
      withDay?.allocations.filter((row) => row.date === "2026-10-15"),
      [{ date: "2026-10-15", quantity: 4 }],
    );

    sqlitePlanningStore.saveCell({ itemId, field: "day", date: "2026-10-15", quantity: 9 });
    const replaced = sqlitePlanningStore.loadSchedule(revision?.id ?? 0)[0];
    assert.deepEqual(
      replaced?.allocations.filter((row) => row.date === "2026-10-15"),
      [{ date: "2026-10-15", quantity: 9 }],
    );

    sqlitePlanningStore.saveCell({ itemId, field: "day", date: "2026-10-15", quantity: 0 });
    const cleared = sqlitePlanningStore.loadSchedule(revision?.id ?? 0)[0];
    assert.equal(cleared?.allocations.some((row) => row.date === "2026-10-15"), false);
    const left = getDb()
      .prepare("SELECT COUNT(*) AS n FROM planning_allocation WHERE item_id = ? AND alloc_date = ?")
      .get(itemId, "2026-10-15") as { n: number };
    assert.equal(left.n, 0);
  });

  it("saveCell atualiza planned_start e planned_end", () => {
    const revision = sqlitePlanningStore.latestRevision("PlanoA");
    const itemId = sqlitePlanningStore.loadSchedule(revision?.id ?? 0)[0]?.id ?? 0;

    sqlitePlanningStore.saveCell({ itemId, field: "start", date: "2026-11-01" });
    sqlitePlanningStore.saveCell({ itemId, field: "end", date: "2026-11-20" });

    const updated = sqlitePlanningStore.loadSchedule(revision?.id ?? 0)[0];
    assert.equal(updated?.plannedStart, "2026-11-01");
    assert.equal(updated?.plannedEnd, "2026-11-20");
  });

  it("normaliza responsável e prioridade e não corta texto longo", () => {
    const revision = sqlitePlanningStore.latestRevision("PlanoA");
    const itemId = sqlitePlanningStore.loadSchedule(revision?.id ?? 0)[0]?.id ?? 0;
    sqlitePlanningStore.saveCell({ itemId, field: "responsavel", value: "  Ana  " });
    sqlitePlanningStore.saveCell({ itemId, field: "prioridade", value: "   " });
    const saved = sqlitePlanningStore.loadSchedule(revision?.id ?? 0)[0];
    assert.equal(saved?.responsavel, "Ana");
    assert.equal(saved?.prioridade, null);
    assert.throws(
      () => sqlitePlanningStore.saveCell({ itemId, field: "prioridade", value: "x".repeat(81) }),
      /80 caracteres/,
    );
    assert.equal(sqlitePlanningStore.loadSchedule(revision?.id ?? 0)[0]?.prioridade, null);
    assert.equal(sqlitePlanningStore.loadSchedule(revision?.id ?? 0)[0]?.responsavel, "Ana");
  });
});
