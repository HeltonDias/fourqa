import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, describe, it } from "node:test";
import { Pool } from "pg";
import { scheduleItemsForScope } from "../../domain/planning.js";
import { postgresPlanningStore } from "./postgresPlanningStore.js";
import type { CommitRevisionInput, PlanningItemWrite } from "../sqlitePlanningStore.js";
import { assertPostgresSchema, migratePostgres, postgresMigrations } from "./migrate.js";
import { closePool } from "./pool.js";
import { runPreflight, runVerify } from "./schemaAudit.js";

const url = process.env.TEST_DATABASE_URL ?? "";

function disposableDatabase(connectionString: string): void {
  let parsed: URL;
  try {
    parsed = new URL(connectionString);
  } catch {
    throw new Error("TEST_DATABASE_URL inválida");
  }
  const host = parsed.hostname;
  const name = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (host !== "127.0.0.1" && host !== "localhost") throw new Error("TEST_DATABASE_URL precisa ser localhost");
  if (/supabase/i.test(host) || /supabase/i.test(name)) throw new Error("TEST_DATABASE_URL não pode apontar para Supabase");
  if (name !== "fourqa_mig") throw new Error("TEST_DATABASE_URL precisa usar o banco fourqa_mig");
}

function item(partial: Partial<PlanningItemWrite> = {}): PlanningItemWrite {
  return {
    suiteId: 10,
    suiteName: "Cadastro",
    plannedStart: "2026-10-01",
    plannedEnd: "2026-10-20",
    baselineQuantity: 1,
    responsavel: "Ana",
    prioridade: "Alta",
    allocations: [{ date: "2026-10-02", quantity: 1 }],
    ...partial,
  };
}

function revision(partial: Partial<CommitRevisionInput> = {}): CommitRevisionInput {
  return {
    planKey: "PlanoA",
    createdAt: "2026-10-15T12:00:00.000Z",
    version: 1,
    reason: "baseline",
    baselineOrigin: "motor",
    scopeSnapshot: 1,
    scope: [{ planId: 1, suiteId: 10, testPointId: 100, testCaseId: 900, label: "Cadastro" }],
    items: [item()],
    ...partial,
  };
}

describe("PostgreSQL real", { skip: url ? false : "TEST_DATABASE_URL ausente", concurrency: 1 }, () => {
  let admin: Pool;

  before(async () => {
    disposableDatabase(url);
    process.env.DATABASE_URL = url;
    process.env.DATABASE_SSL_CA_FILE = "";
    process.env.DB_PROVIDER = "postgres";
    admin = new Pool({ connectionString: url, connectionTimeoutMillis: 5_000, ssl: false });
    await resetSchema();
  });

  after(async () => {
    await closePool();
    await admin.end();
  });

  async function resetSchema(): Promise<void> {
    await closePool();
    await admin.query("DROP SCHEMA IF EXISTS public CASCADE");
    await admin.query("CREATE SCHEMA public");
    await admin.query("GRANT ALL ON SCHEMA public TO public");
  }

  async function versions(): Promise<number[]> {
    const current = await admin.query<{ version: number }>("SELECT version FROM schema_migrations ORDER BY version");
    return current.rows.map((row) => Number(row.version));
  }

  it("aplica 001, 002 e 003 uma vez e recusa lacuna", async () => {
    await migratePostgres();
    assert.deepEqual(await versions(), [1, 2, 3]);
    await migratePostgres();
    assert.deepEqual(await versions(), [1, 2, 3]);
    await assertPostgresSchema();
    const indexes = await admin.query<{ indexname: string }>(
      "SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname IN ('uq_plan_item_suite', 'uq_plan_item_point') ORDER BY indexname",
    );
    assert.deepEqual(indexes.rows.map((row) => row.indexname), ["uq_plan_item_point", "uq_plan_item_suite"]);

    await resetSchema();
    await admin.query(readFileSync(postgresMigrations[0]!.file, "utf8"));
    await admin.query("CREATE TABLE schema_migrations (version integer PRIMARY KEY, applied_at text NOT NULL)");
    await admin.query("INSERT INTO schema_migrations (version, applied_at) VALUES (1, 't'), (3, 't')");
    await assert.rejects(() => migratePostgres(), /inconsistente/);
    await assert.rejects(() => assertPostgresSchema(), /inconsistente/);
    assert.deepEqual(await versions(), [1, 3]);
    const added = await admin.query(
      "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'planning_item' AND column_name = 'test_point_id'",
    );
    assert.equal(added.rows.length, 0);
  });

  it("bloqueia a 002 quando a suíte já está duplicada", async () => {
    await resetSchema();
    await admin.query(readFileSync(postgresMigrations[0]!.file, "utf8"));
    await admin.query("CREATE TABLE schema_migrations (version integer PRIMARY KEY, applied_at text NOT NULL)");
    await admin.query("INSERT INTO schema_migrations (version, applied_at) VALUES (1, 't')");
    await admin.query(
      `INSERT INTO planning (plan_key, created_at) VALUES ('PlanoA', '2026-10-15T12:00:00.000Z')`,
    );
    await admin.query(
      `INSERT INTO planning_revision (planning_id, version, created_at, reason, baseline_origin, scope_snapshot)
       SELECT id, 1, '2026-10-15T12:00:00.000Z', 'baseline', 'motor', 1 FROM planning`,
    );
    await admin.query(
      `INSERT INTO planning_item (revision_id, suite_id, suite_name, baseline_quantity)
       SELECT id, 10, 'Cadastro', 1 FROM planning_revision
       UNION ALL
       SELECT id, 10, 'Cadastro', 1 FROM planning_revision`,
    );
    await assert.rejects(() => migratePostgres(), /Migração 002 bloqueada/);
    assert.deepEqual(await versions(), [1]);
    const preflight = await runPreflight();
    assert.equal(preflight.precheck, "FAIL");
    assert.equal(preflight.suiteConflicts.length, 1);
    assert.equal(preflight.pointConflicts.length, 0);
    assert.equal(preflight.planningItemColumns.includes("responsavel"), false);
  });

  it("grava agenda, herança e isolamento e desfaz revisão incompleta", async () => {
    await resetSchema();
    await migratePostgres();
    const first = await postgresPlanningStore.commitRevision(revision({
      items: [
        item({ suiteId: 10, suiteName: "Cadastro", responsavel: "  Ana  ", prioridade: "  Alta  " }),
        item({
          suiteId: 20,
          suiteName: "Cadastro",
          responsavel: "Bruno",
          prioridade: "Baixa",
          plannedStart: "2026-10-03",
          allocations: [{ date: "2026-10-04", quantity: 2 }],
        }),
      ],
      scope: [
        { planId: 1, suiteId: 10, testPointId: 100, testCaseId: 900, label: "Cadastro" },
        { planId: 1, suiteId: 20, testPointId: 200, testCaseId: 900, label: "Cadastro" },
      ],
    }));
    await postgresPlanningStore.commitRevision(revision({
      planKey: "PlanoB",
      reason: "baseline B",
      items: [item({ suiteId: 10, suiteName: "Cadastro", responsavel: "Carla", prioridade: "Outra", allocations: [] })],
    }));
    const bySuite = async (revisionId: number, suiteId: number) =>
      (await postgresPlanningStore.loadSchedule(revisionId)).find((row) => row.suiteId === suiteId);
    const opened = await bySuite(first, 10);
    assert.equal(opened?.responsavel, "Ana");
    assert.equal(opened?.prioridade, "Alta");
    assert.equal(opened?.suiteName, "Cadastro");
    assert.deepEqual(opened?.allocations, [{ date: "2026-10-02", quantity: 1 }]);
    assert.equal((await bySuite(first, 20))?.responsavel, "Bruno");

    await postgresPlanningStore.saveCell({ itemId: opened!.id, field: "start", date: "2026-10-08" });
    await postgresPlanningStore.saveCell({ itemId: opened!.id, field: "end", date: "2026-10-21" });
    await postgresPlanningStore.saveCell({ itemId: opened!.id, field: "day", date: "2026-10-02", quantity: 0 });
    await postgresPlanningStore.saveCell({ itemId: opened!.id, field: "day", date: "2026-10-09", quantity: 4 });
    await postgresPlanningStore.saveCell({ itemId: opened!.id, field: "prioridade", value: "  " });
    const editedRow = await bySuite(first, 10);
    assert.equal(editedRow?.plannedStart, "2026-10-08");
    assert.equal(editedRow?.plannedEnd, "2026-10-21");
    assert.equal(editedRow?.prioridade, null);
    assert.deepEqual(editedRow?.allocations, [{ date: "2026-10-09", quantity: 4 }]);
    assert.equal((await bySuite((await postgresPlanningStore.latestRevision("PlanoB"))!.id, 10))?.responsavel, "Carla");
    const edited = await postgresPlanningStore.loadSchedule(first);

    const next = scheduleItemsForScope({
      scope: [
        { planId: 1, suiteId: 10, testPointId: 100, testCaseId: 900, label: "Cadastro" },
        { planId: 1, suiteId: 10, testPointId: 101, testCaseId: 901, label: "Cadastro" },
        { planId: 1, suiteId: 20, testPointId: 200, testCaseId: 900, label: "Cadastro" },
        { planId: 1, suiteId: null, testPointId: 300, testCaseId: 900, label: "Solto" },
      ],
      suiteNames: new Map([[10, "Cadastro renomeado"], [20, "Outra suíte"]]),
      previous: edited.map((row) => ({
        suiteId: row.suiteId,
        testPointId: row.testPointId ?? null,
        testCaseId: row.testCaseId ?? null,
        suiteName: row.suiteName,
        plannedStart: row.plannedStart,
        plannedEnd: row.plannedEnd,
        responsavel: row.responsavel ?? null,
        prioridade: row.prioridade ?? null,
        baselineQuantity: row.baselineQuantity ?? 0,
        allocations: row.allocations,
      })),
    });
    await postgresPlanningStore.commitRevision(revision({
      version: 2,
      reason: "replanejamento",
      items: next,
      scope: [
        { planId: 1, suiteId: 10, testPointId: 100, testCaseId: 900, label: "Cadastro" },
        { planId: 1, suiteId: 10, testPointId: 101, testCaseId: 901, label: "Cadastro" },
        { planId: 1, suiteId: 20, testPointId: 200, testCaseId: 900, label: "Cadastro" },
        { planId: 1, suiteId: null, testPointId: 300, testCaseId: 900, label: "Solto" },
      ],
    }));
    const latest = (await postgresPlanningStore.latestRevision("PlanoA"))!;
    const oldSuite = await bySuite(first, 10);
    const currentSuite = await bySuite(latest.id, 10);
    assert.equal(oldSuite?.suiteName, "Cadastro");
    assert.equal(oldSuite?.plannedStart, "2026-10-08");
    assert.equal((await bySuite(first, 20))?.responsavel, "Bruno");
    assert.equal(currentSuite?.suiteName, "Cadastro renomeado");
    assert.equal(currentSuite?.responsavel, "Ana");
    assert.equal(currentSuite?.prioridade, null);
    assert.equal((await bySuite(latest.id, 20))?.prioridade, "Baixa");
    const loose = (await postgresPlanningStore.loadSchedule(latest.id)).find((row) => row.testPointId === 300);
    assert.equal(loose?.suiteId, null);
    assert.equal(loose?.responsavel, null);
    const scope = await postgresPlanningStore.loadScope(latest.id);
    const sharedCase = scope.filter((row) => row.testCaseId === 900);
    assert.equal(new Set(sharedCase.map((row) => row.suiteId)).size >= 2, true);
    await postgresPlanningStore.saveCell({ itemId: currentSuite!.id, field: "responsavel", value: "Diana" });
    assert.equal((await bySuite(first, 10))?.responsavel, "Ana");
    assert.equal((await bySuite(latest.id, 10))?.responsavel, "Diana");
    assert.equal((await bySuite((await postgresPlanningStore.latestRevision("PlanoB"))!.id, 10))?.prioridade, "Outra");

    await assert.rejects(
      () => postgresPlanningStore.commitRevision(revision({
        planKey: "PlanoQuebra",
        items: [item({ suiteId: 10 }), item({ suiteId: 10, suiteName: "Outra" })],
      })),
      /uq_plan_item_suite|duplicate key/i,
    );
    const broken = await admin.query("SELECT COUNT(*)::int AS n FROM planning WHERE plan_key = 'PlanoQuebra'");
    assert.equal(Number(broken.rows[0]?.n), 0);
    await assert.rejects(
      () => postgresPlanningStore.commitRevision(revision({
        planKey: "PlanoPonto",
        items: [
          item({ suiteId: null, suiteName: null, testPointId: 7, testCaseId: 1, responsavel: null, prioridade: null, allocations: [] }),
          item({ suiteId: null, suiteName: null, testPointId: 7, testCaseId: 2, responsavel: null, prioridade: null, allocations: [] }),
        ],
        scope: [],
      })),
      /uq_plan_item_point|duplicate key/i,
    );
    const pointPlan = await admin.query("SELECT COUNT(*)::int AS n FROM planning WHERE plan_key = 'PlanoPonto'");
    assert.equal(Number(pointPlan.rows[0]?.n), 0);

    const preflight = await runPreflight();
    const verified = await runVerify();
    assert.equal(preflight.precheck, "PASS");
    assert.deepEqual(preflight.pending, []);
    assert.equal(preflight.suiteConflicts.length, 0);
    assert.equal(preflight.pointConflicts.length, 0);
    assert.equal(verified.verify, "PASS");
    assert.deepEqual(verified.versions, [1, 2, 3]);
  });
});
