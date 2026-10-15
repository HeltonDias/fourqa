import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import type { ExecucaoRow, FalhaRow } from "../../types.js";
import { PersistenceProviderError, getStores, resolveDbProvider } from "../../persistence/provider.js";
import type { CommitRevisionInput } from "../sqlitePlanningStore.js";
import { createFakePostgres } from "./fakePostgres.js";
import { bindPostgresTestPool } from "./pool.js";
import { postgresAzureSnapshotStore } from "./postgresAzureSnapshotStore.js";
import { postgresMetaStore } from "./postgresMetaStore.js";
import { postgresPlanningStore } from "./postgresPlanningStore.js";

afterEach(() => {
  bindPostgresTestPool(null);
});

function useFake() {
  const fake = createFakePostgres();
  bindPostgresTestPool(fake.pool);
  return fake;
}

function revision(partial: Partial<CommitRevisionInput> & Pick<CommitRevisionInput, "planKey" | "version">): CommitRevisionInput {
  return {
    createdAt: "2026-10-13T12:00:00.000Z",
    reason: "baseline",
    baselineOrigin: "motor",
    scopeSnapshot: 1,
    scope: [{ planId: 10, suiteId: 20, testPointId: 30, testCaseId: 40, label: partial.planKey }],
    items: [{
      suiteId: 20,
      suiteName: partial.planKey,
      plannedStart: "2026-10-12",
      plannedEnd: "2026-10-20",
      baselineQuantity: 4,
      allocations: [{ date: "2026-10-13", quantity: 2 }],
    }],
    ...partial,
  };
}

function exec(planKey: string, testPointId: number): Omit<ExecucaoRow, "id"> {
  return {
    plan_key: planKey,
    plan_id: 1,
    plan_name: planKey,
    frente: null,
    atalho: null,
    processo: null,
    suite_id: null,
    suite_name: planKey,
    parent_suite_id: null,
    suite_depth: null,
    suite_path: null,
    dimensions_json: null,
    test_point_id: testPointId,
    test_case_id: null,
    test_case_title: planKey,
    responsabilidade: null,
    test_case_state: null,
    test_point_state: null,
    outcome: null,
    date_completed: null,
    run_by: null,
    last_updated_date: null,
    last_test_run_id: null,
    last_result_id: null,
    test_case_link: null,
    case_priority: null,
    test_case_tags: null,
  };
}

function falha(planKey: string, bugId: number): Omit<FalhaRow, "id"> {
  return {
    plan_key: planKey,
    responsavel: null,
    ambiente: null,
    categoria: null,
    bug_id: bugId,
    impacto: null,
    frente: null,
    titulo: planKey,
    status: null,
    criacao: null,
    fechamento: null,
    links: null,
    tags: null,
  };
}

describe("stores PostgreSQL em memória", { concurrency: 1 }, () => {
  it("grava cabeçalho e período sem apagar as outras metas", async () => {
    useFake();
    await postgresMetaStore.set("cabecalho_titulo", "STATUS REPORT QA");
    await postgresMetaStore.set("cabecalho_subtitulo", "Fase QA");
    await postgresMetaStore.set("data_inicio", "2026-10-12");
    await postgresMetaStore.set("data_fim", "2026-11-12");
    await postgresMetaStore.set("cabecalho_titulo", "STATUS REPORT QA 2");

    assert.equal(await postgresMetaStore.get("cabecalho_titulo"), "STATUS REPORT QA 2");
    assert.equal(await postgresMetaStore.get("cabecalho_subtitulo"), "Fase QA");
    assert.equal(await postgresMetaStore.get("data_inicio"), "2026-10-12");
    assert.equal(await postgresMetaStore.get("data_fim"), "2026-11-12");
    assert.equal(await postgresMetaStore.get("ausente"), null);
  });

  it("isola revisão por PlanKey e reaproveita o planning na versão seguinte", async () => {
    const fake = useFake();
    const first = await postgresPlanningStore.commitRevision(revision({ planKey: "PlanoA", version: 1 }));
    await postgresPlanningStore.commitRevision(revision({ planKey: "PlanoB", version: 1, scope: [], items: [] }));
    const second = await postgresPlanningStore.commitRevision(revision({ planKey: "PlanoA", version: 2, reason: "ajuste" }));

    assert.equal((await postgresPlanningStore.latestRevision("PlanoA"))?.version, 2);
    assert.equal((await postgresPlanningStore.latestRevision("PlanoB"))?.version, 1);
    assert.equal((await postgresPlanningStore.listRevisions("PlanoA")).map((row) => row.version).join(","), "1,2");
    assert.equal(await postgresPlanningStore.revisionByVersion("PlanoB", 2), null);
    const scope = await postgresPlanningStore.loadScope(first);
    assert.deepEqual(scope.map((item) => item.label), ["PlanoA"]);
    const schedule = await postgresPlanningStore.loadSchedule(second);
    assert.equal(schedule[0]?.suiteName, "PlanoA");
    assert.equal(schedule[0]?.allocations[0]?.quantity, 2);
    assert.equal(fake.counts().planning, 2);
    assert.equal(fake.counts().revisions, 3);
    assert.equal(fake.log.some((sql) => sql === "DELETE FROM execucoes"), false);
  });

  it("edita célula e desfaz a transação quando o item não existe", async () => {
    const fake = useFake();
    const revisionId = await postgresPlanningStore.commitRevision(revision({ planKey: "PlanoA", version: 1 }));
    const itemId = (await postgresPlanningStore.loadSchedule(revisionId))[0]!.id;

    await postgresPlanningStore.saveCell({ itemId, field: "start", date: "2026-10-14" });
    await postgresPlanningStore.saveCell({ itemId, field: "end", date: null });
    await postgresPlanningStore.saveCell({ itemId, field: "day", date: "2026-10-13", quantity: 0 });
    await postgresPlanningStore.saveCell({ itemId, field: "day", date: "2026-10-15", quantity: 3 });

    const saved = (await postgresPlanningStore.loadSchedule(revisionId))[0]!;
    assert.equal(saved.plannedStart, "2026-10-14");
    assert.equal(saved.plannedEnd, null);
    assert.deepEqual(saved.allocations, [{ date: "2026-10-15", quantity: 3 }]);

    await assert.rejects(
      () => postgresPlanningStore.saveCell({ itemId: 999, field: "day", date: "2026-10-15", quantity: 1 }),
      /vínculo ausente: planning_item/,
    );
    assert.equal(fake.counts().allocations, 1);
    assert.equal(fake.log.filter((sql) => sql === "ROLLBACK").length, 1);
  });

  it("desfaz a revisão incompleta e conserva o buraco da sequência", async () => {
    const fake = useFake();
    await postgresPlanningStore.commitRevision(revision({ planKey: "PlanoA", version: 1 }));
    const failing = {
      query: fake.pool.query,
      async connect() {
        const client = await fake.pool.connect();
        return {
          release: () => client.release(),
          async query(sql: string, params?: unknown[]) {
            if (sql.includes("INSERT INTO planning_scope_item")) throw new Error("escopo rejeitado");
            return client.query(sql, params);
          },
        };
      },
    };
    bindPostgresTestPool(failing);
    await assert.rejects(
      () => postgresPlanningStore.commitRevision(revision({ planKey: "PlanoA", version: 2 })),
      /escopo rejeitado/,
    );
    bindPostgresTestPool(fake.pool);

    assert.equal((await postgresPlanningStore.latestRevision("PlanoA"))?.version, 1);
    assert.equal(fake.counts().revisions, 1);
    assert.equal(fake.counts().nextRevision, 3);
    const next = await postgresPlanningStore.commitRevision(revision({ planKey: "PlanoA", version: 2, scope: [], items: [] }));
    assert.equal(next, 3);
    assert.equal(fake.log.filter((sql) => sql === "ROLLBACK").length, 1);
  });

  it("substitui o snapshot inteiro, preserva meta fora do payload e filtra PlanKey", async () => {
    const fake = useFake();
    await postgresMetaStore.set("data_inicio", "2026-10-12");
    await postgresAzureSnapshotStore.replaceSnapshot({
      execucoes: [exec("PlanoA", 1), exec("PlanoB", 2)],
      falhas: [falha("PlanoA", 7)],
      meta: { kpi_plan_key: "PlanoA" },
    });
    await postgresAzureSnapshotStore.replaceSnapshot({
      execucoes: [exec("PlanoB", 9)],
      falhas: [],
      meta: { kpi_plan_key: "PlanoB" },
    });

    assert.equal((await postgresAzureSnapshotStore.listExecucoes("PlanoA")).length, 0);
    const page = await postgresAzureSnapshotStore.queryExecucoes({ planKey: "PlanoB", limit: 50, offset: 0, q: "" });
    assert.equal(page.total, 1);
    assert.deepEqual(page.rows.map((row) => row.plan_key), ["PlanoB"]);
    assert.equal((await postgresAzureSnapshotStore.queryFalhas({ planKey: "Inexistente", limit: 10, offset: 0, q: "" })).total, 0);
    await assert.rejects(
      () => postgresAzureSnapshotStore.queryExecucoes({ planKey: "  ", limit: 10, offset: 0, q: "" }),
      /planKey obrigatório/,
    );
    assert.equal(await postgresMetaStore.get("data_inicio"), "2026-10-12");
    assert.equal(await postgresMetaStore.get("kpi_plan_key"), "PlanoB");
    assert.equal(fake.log.some((sql) => sql.includes("LOCK TABLE execucoes, falhas, workbook_meta")), true);
    assert.equal(fake.log.some((sql) => sql === "DELETE FROM workbook_meta" || sql.startsWith("DELETE FROM planning")), false);
  });

  it("desfaz a substituição do snapshot quando a gravação falha", async () => {
    const fake = useFake();
    await postgresAzureSnapshotStore.replaceSnapshot({
      execucoes: [exec("PlanoA", 1)],
      falhas: [falha("PlanoA", 4)],
      meta: { kpi_plan_key: "PlanoA" },
    });
    bindPostgresTestPool({
      query: fake.pool.query,
      async connect() {
        const client = await fake.pool.connect();
        return {
          release: () => client.release(),
          async query(sql: string, params?: unknown[]) {
            if (sql.startsWith("INSERT INTO falhas")) throw new Error("falha rejeitada");
            return client.query(sql, params);
          },
        };
      },
    });

    await assert.rejects(
      () => postgresAzureSnapshotStore.replaceSnapshot({
        execucoes: [exec("PlanoB", 2)],
        falhas: [falha("PlanoB", 8)],
        meta: { kpi_plan_key: "PlanoB" },
      }),
      /falha rejeitada/,
    );

    assert.deepEqual((await postgresAzureSnapshotStore.listExecucoes("PlanoA")).map((row) => row.test_point_id), [1]);
    assert.equal((await postgresAzureSnapshotStore.listFalhas("PlanoA"))[0]?.bug_id, 4);
    assert.equal(await postgresMetaStore.get("kpi_plan_key"), "PlanoA");
    assert.equal(fake.log.filter((sql) => sql === "ROLLBACK").length, 1);
  });

  it("falha de conexão PostgreSQL não entrega o store SQLite nem a senha", async () => {
    const previousProvider = process.env.DB_PROVIDER;
    const previousUrl = process.env.DATABASE_URL;
    process.env.DB_PROVIDER = "postgres";
    process.env.DATABASE_URL = "postgresql://user:super-secret@127.0.0.1:1/fourqa";
    bindPostgresTestPool({
      async query() {
        throw new Error("connect ECONNREFUSED");
      },
      async connect() {
        throw new Error("connect ECONNREFUSED");
      },
    });
    try {
      assert.equal(resolveDbProvider("postgres"), "postgres");
      await assert.rejects(
        () => getStores(),
        (err: unknown) => {
          assert.ok(err instanceof PersistenceProviderError);
          assert.equal(err.message, "connect ECONNREFUSED");
          assert.equal(err.message.includes("super-secret"), false);
          assert.equal(err.message.includes("postgresql://"), false);
          return true;
        },
      );
    } finally {
      if (previousProvider === undefined) delete process.env.DB_PROVIDER;
      else process.env.DB_PROVIDER = previousProvider;
      if (previousUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previousUrl;
    }
  });

  it("isola a identidade do item e preserva a revisão anterior", async () => {
    useFake();
    await postgresPlanningStore.commitRevision(revision({
      planKey: "PlanoA",
      version: 1,
      scope: [
        { planId: 1, suiteId: 10, testPointId: 100, testCaseId: 900, label: "Cadastro" },
        { planId: 1, suiteId: 20, testPointId: 200, testCaseId: 900, label: "Cadastro" },
        { planId: 1, suiteId: null, testPointId: 300, testCaseId: 900, label: "Cadastro" },
      ],
      items: [
        { suiteId: 10, suiteName: "Antiga", plannedStart: "2026-10-01", plannedEnd: "2026-10-10", baselineQuantity: 1, allocations: [] },
        { suiteId: 20, suiteName: "Antiga", plannedStart: "2026-10-02", plannedEnd: null, baselineQuantity: 1, allocations: [] },
        { suiteId: null, suiteName: null, testPointId: 300, testCaseId: 900, plannedStart: "2026-10-03", plannedEnd: null, baselineQuantity: 1, allocations: [] },
      ],
    }));
    await postgresPlanningStore.commitRevision(revision({
      planKey: "PlanoB",
      version: 1,
      items: [{ suiteId: 10, suiteName: "Antiga", plannedStart: "2026-12-01", plannedEnd: null, baselineQuantity: 1, allocations: [] }],
    }));
    const first = await postgresPlanningStore.latestRevision("PlanoA");
    const opened = await postgresPlanningStore.loadSchedule(first!.id);
    assert.deepEqual(opened.map((item) => item.plannedStart), ["2026-10-01", "2026-10-02", "2026-10-03"]);
    assert.equal(opened[2]?.testPointId, 300);
    assert.equal(opened[2]?.testCaseId, 900);
    await postgresPlanningStore.saveCell({ itemId: opened[0]!.id, field: "start", date: "2026-10-08" });
    const other = await postgresPlanningStore.loadSchedule((await postgresPlanningStore.latestRevision("PlanoB"))!.id);
    assert.equal(other[0]?.plannedStart, "2026-12-01");
    assert.equal((await postgresPlanningStore.loadSchedule(first!.id))[0]?.plannedStart, "2026-10-08");

    await postgresPlanningStore.commitRevision(revision({
      planKey: "PlanoA",
      version: 2,
      scope: [{ planId: 1, suiteId: 10, testPointId: 100, testCaseId: 900, label: "Cadastro" }],
      items: [{ suiteId: 10, suiteName: "Nova", plannedStart: "2026-10-08", plannedEnd: "2026-10-10", baselineQuantity: 1, allocations: [] }],
    }));
    const versions = await postgresPlanningStore.listRevisions("PlanoA");
    assert.deepEqual(versions.map((row) => row.version), [1, 2]);
    const old = await postgresPlanningStore.revisionByVersion("PlanoA", 1);
    assert.equal((await postgresPlanningStore.loadSchedule(old!.id)).length, 3);
    assert.equal(await postgresPlanningStore.latestRevision("PlanoNovo"), null);

    await assert.rejects(
      () => postgresPlanningStore.commitRevision(revision({
        planKey: "PlanoA",
        version: 3,
        items: [
          { suiteId: null, suiteName: null, testPointId: 7, testCaseId: 1, plannedStart: null, plannedEnd: null, baselineQuantity: 1, allocations: [] },
          { suiteId: null, suiteName: null, testPointId: 7, testCaseId: 2, plannedStart: null, plannedEnd: null, baselineQuantity: 1, allocations: [] },
        ],
      })),
      /identidade duplicada: planning_item point/,
    );
    assert.equal(await postgresPlanningStore.latestRevision("PlanoA").then((row) => row?.version), 2);
    assert.equal((await postgresPlanningStore.loadSchedule((await postgresPlanningStore.latestRevision("PlanoB"))!.id))[0]?.plannedStart, "2026-12-01");
  });

  it("isola responsável e prioridade da suíte e mantém a revisão antiga", async () => {
    useFake();
    await postgresPlanningStore.commitRevision(revision({
      planKey: "PlanoA",
      version: 1,
      items: [
        { suiteId: 10, suiteName: "Cadastro", responsavel: "Ana", prioridade: "Alta", plannedStart: "2026-10-01", plannedEnd: null, baselineQuantity: 1, allocations: [] },
        { suiteId: 20, suiteName: "Cadastro", responsavel: "Bruno", prioridade: "Baixa", plannedStart: null, plannedEnd: null, baselineQuantity: 1, allocations: [] },
      ],
    }));
    await postgresPlanningStore.commitRevision(revision({
      planKey: "PlanoB",
      version: 1,
      items: [{ suiteId: 10, suiteName: "Cadastro", responsavel: "Carla", prioridade: "Média", plannedStart: null, plannedEnd: null, baselineQuantity: 1, allocations: [] }],
    }));
    const current = await postgresPlanningStore.loadSchedule((await postgresPlanningStore.latestRevision("PlanoA"))!.id);
    await postgresPlanningStore.saveCell({ itemId: current[0]!.id, field: "prioridade", value: "Crítica" });
    const reopened = await postgresPlanningStore.loadSchedule((await postgresPlanningStore.latestRevision("PlanoA"))!.id);
    assert.equal(reopened[0]?.prioridade, "Crítica");
    assert.equal(reopened[0]?.responsavel, "Ana");
    await postgresPlanningStore.saveCell({ itemId: current[0]!.id, field: "responsavel", value: "  Ana  " });
    await postgresPlanningStore.saveCell({ itemId: current[0]!.id, field: "prioridade", value: "   " });
    const normalized = await postgresPlanningStore.loadSchedule((await postgresPlanningStore.latestRevision("PlanoA"))!.id);
    assert.equal(normalized[0]?.responsavel, "Ana");
    assert.equal(normalized[0]?.prioridade, null);
    await assert.rejects(
      () => postgresPlanningStore.saveCell({ itemId: current[0]!.id, field: "responsavel", value: "x".repeat(81) }),
      /80 caracteres/,
    );
    assert.equal((await postgresPlanningStore.loadSchedule((await postgresPlanningStore.latestRevision("PlanoA"))!.id))[0]?.responsavel, "Ana");
    assert.equal(reopened[1]?.prioridade, "Baixa");
    assert.equal((await postgresPlanningStore.loadSchedule((await postgresPlanningStore.latestRevision("PlanoB"))!.id))[0]?.responsavel, "Carla");
    await postgresPlanningStore.commitRevision(revision({
      planKey: "PlanoA",
      version: 2,
      items: [{ suiteId: 10, suiteName: "Cadastro novo", responsavel: "Ana", prioridade: "Crítica", plannedStart: "2026-10-01", plannedEnd: null, baselineQuantity: 2, allocations: [] }],
    }));
    const old = await postgresPlanningStore.revisionByVersion("PlanoA", 1);
    assert.equal((await postgresPlanningStore.loadSchedule(old!.id))[1]?.prioridade, "Baixa");
    assert.equal((await postgresPlanningStore.loadSchedule((await postgresPlanningStore.latestRevision("PlanoA"))!.id))[0]?.suiteName, "Cadastro novo");
  });
});
