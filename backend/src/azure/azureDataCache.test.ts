import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AzureClient } from "./client.js";
import type { PlanConfig, SyncConfig } from "./config.js";
import type { ExecucaoInsert, PlanExecutions } from "./execucoes.js";
import type { AzureRefreshPorts } from "./azureDataRefresh.js";
import type { FalhaInsert, PlanFalhas } from "./falhas.js";
import type { KpiImpactos } from "./kpis.js";
import { buildAzureRefreshDraft, refreshInMemoryAzureCache } from "./azureDataRefresh.js";
import { InMemoryAzureCache, resetInMemoryAzureCache } from "./inMemoryAzureCache.js";
import { SyncValidationError } from "../domain/validateSync.js";

const kpi: KpiImpactos = {
  total: 1,
  foursys: 0,
  cliente: 1,
  reteste: 0,
  semResultadoMapeado: 0,
  calculadoEm: "2026-10-14T12:00:00.000Z",
};

function exec(planKey: string, point = 1): ExecucaoInsert {
  return {
    plan_key: planKey,
    plan_id: 10,
    plan_name: planKey,
    frente: null,
    atalho: null,
    processo: null,
    suite_id: 1,
    suite_name: "suite",
    parent_suite_id: null,
    suite_depth: 1,
    suite_path: null,
    dimensions_json: null,
    test_point_id: point,
    test_case_id: point,
    test_case_title: "ct",
    responsabilidade: null,
    test_case_state: null,
    test_point_state: null,
    outcome: "Passed",
    date_completed: null,
    run_by: null,
    last_updated_date: null,
    last_test_run_id: 1,
    last_result_id: 1,
    test_case_link: null,
    case_priority: null,
    test_case_tags: null,
  };
}

function falha(planKey: string, bugId: number): FalhaInsert {
  return {
    plan_key: planKey,
    responsavel: null,
    ambiente: null,
    categoria: null,
    bug_id: bugId,
    impacto: null,
    frente: null,
    titulo: "bug",
    status: null,
    criacao: null,
    fechamento: null,
    links: null,
    tags: null,
  };
}

function cfg(): SyncConfig {
  return {
    azure: { organization: "org", project: "proj", apiVersion: "7.0", pat: "secret" },
    plans: [
      { planKey: "EndToEnd", planId: 1, planName: "E2E", suiteNameFilter: "", maxSuites: 0 },
      { planKey: "UAT", planId: 2, planName: "UAT", suiteNameFilter: "", maxSuites: 0 },
    ],
    hierarchy: [],
    responsibilities: new Map(),
    validFronts: [],
    kpiPlanKey: "EndToEnd",
  };
}

const fakeClient = {} as AzureClient;

function planLoad(plan: PlanConfig, rows: ExecucaoInsert[]): PlanExecutions {
  return {
    plan,
    rows,
    suitesProcessed: rows.length > 0 ? 1 : 0,
    suites: [{ suiteId: 1, parentSuiteId: null }],
    dimensions: [],
  };
}

describe("AzureDataPort em memória", () => {
  it("começa vazio e distingue plano não carregado de carregado sem linhas", async () => {
    resetInMemoryAzureCache();
    const cache = new InMemoryAzureCache();
    assert.equal(cache.getPlan("EndToEnd").state, "empty");
    assert.equal(cache.getRefreshMeta().stale, false);

    const ports: AzureRefreshPorts = {
      loadPlanExecutions: async (_client, plan) =>
        planLoad(plan, plan.planKey === "EndToEnd" ? [exec("EndToEnd")] : []),
      loadFalhas: async (): Promise<PlanFalhas[]> => [
        { plan: cfg().plans[0], rows: [falha("EndToEnd", 1)], bugMeta: new Map(), runCount: 1, resultCount: 1 },
        { plan: cfg().plans[1], rows: [], bugMeta: new Map(), runCount: 0, resultCount: 0 },
      ],
      calculateKpiImpactos: async () => kpi,
      validateSyncResult: () => {},
    };

    await refreshInMemoryAzureCache(cache, fakeClient, cfg(), () => {}, ports);

    assert.equal(cache.getPlan("EndToEnd").state, "loaded");
    assert.equal(cache.getPlan("EndToEnd").execucoes.length, 1);
    assert.equal(cache.getPlan("UAT").state, "loaded");
    assert.equal(cache.getPlan("UAT").execucoes.length, 0);
    assert.equal(cache.getPlan("UAT").falhas.length, 0);
    assert.equal(cache.getPlan("PlanTeste").state, "empty");
    assert.equal(cache.getPlan("EndToEnd").kpi?.cliente, 1);
    assert.equal(cache.getPlan("UAT").kpi, null);
  });

  it("isola PlanKeys e permite ler falhas UAT com outro plano ativo", async () => {
    const cache = new InMemoryAzureCache();
    const ports: AzureRefreshPorts = {
      loadPlanExecutions: async (_client, plan) =>
        planLoad(
          plan,
          plan.planKey === "EndToEnd" ? [exec("EndToEnd", 1)] : [exec("UAT", 2)],
        ),
      loadFalhas: async (): Promise<PlanFalhas[]> => [
        { plan: cfg().plans[0], rows: [], bugMeta: new Map(), runCount: 0, resultCount: 0 },
        { plan: cfg().plans[1], rows: [falha("UAT", 99)], bugMeta: new Map(), runCount: 1, resultCount: 1 },
      ],
      calculateKpiImpactos: async () => kpi,
      validateSyncResult: () => {},
    };
    await refreshInMemoryAzureCache(cache, fakeClient, cfg(), () => {}, ports);

    const statusView = cache.getPlan("EndToEnd");
    const uatFalhas = cache.getPlan("UAT");
    assert.equal(statusView.execucoes[0]?.plan_key, "EndToEnd");
    assert.equal(uatFalhas.falhas[0]?.bug_id, 99);
    assert.equal(uatFalhas.falhas[0]?.plan_key, "UAT");
  });

  it("substitui o conjunto de planos de forma atômica após validate", async () => {
    const cache = new InMemoryAzureCache();
    let loadCalls = 0;
    const ports: AzureRefreshPorts = {
      loadPlanExecutions: async (_client, plan) => {
        loadCalls += 1;
        return planLoad(plan, [exec(plan.planKey, loadCalls)]);
      },
      loadFalhas: async (): Promise<PlanFalhas[]> => [
        { plan: cfg().plans[0], rows: [], bugMeta: new Map(), runCount: 0, resultCount: 0 },
        { plan: cfg().plans[1], rows: [], bugMeta: new Map(), runCount: 0, resultCount: 0 },
      ],
      calculateKpiImpactos: async () => kpi,
      validateSyncResult: () => {},
    };
    await refreshInMemoryAzureCache(cache, fakeClient, cfg(), () => {}, ports);
    const firstPoint = cache.getPlan("EndToEnd").execucoes[0]?.test_point_id;

    await refreshInMemoryAzureCache(cache, fakeClient, cfg(), () => {}, ports);
    const secondPoint = cache.getPlan("EndToEnd").execucoes[0]?.test_point_id;
    assert.notEqual(firstPoint, secondPoint);
    assert.equal(cache.listLoadedPlanKeys().join(","), "EndToEnd,UAT");
  });

  it("preserva o cache anterior e marca stale quando o refresh falha", async () => {
    const cache = new InMemoryAzureCache();
    const good: AzureRefreshPorts = {
      loadPlanExecutions: async (_client, plan) => planLoad(plan, [exec(plan.planKey)]),
      loadFalhas: async (): Promise<PlanFalhas[]> => [
        { plan: cfg().plans[0], rows: [], bugMeta: new Map(), runCount: 0, resultCount: 0 },
        { plan: cfg().plans[1], rows: [], bugMeta: new Map(), runCount: 0, resultCount: 0 },
      ],
      calculateKpiImpactos: async () => kpi,
      validateSyncResult: () => {},
    };
    await refreshInMemoryAzureCache(cache, fakeClient, cfg(), () => {}, good);
    const before = cache.getPlan("EndToEnd").execucoes[0]?.test_point_id;

    const bad = {
      ...good,
      validateSyncResult: () => {
        throw new SyncValidationError(["lote inválido"]);
      },
    };
    await assert.rejects(() => refreshInMemoryAzureCache(cache, fakeClient, cfg(), () => {}, bad), /lote inválido/);

    assert.equal(cache.getPlan("EndToEnd").execucoes[0]?.test_point_id, before);
    assert.equal(cache.getPlan("EndToEnd").state, "stale");
    assert.equal(cache.getRefreshMeta().stale, true);
  });

  it("não publica rascunho parcial quando loadFalhas falha no meio", async () => {
    const cache = new InMemoryAzureCache();
    await assert.rejects(
      () =>
        buildAzureRefreshDraft(
          fakeClient,
          cfg(),
          () => {},
          {
            loadPlanExecutions: async (_client, plan) => planLoad(plan, [exec(plan.planKey)]),
            loadFalhas: async () => {
              throw new Error("Azure indisponível");
            },
            calculateKpiImpactos: async () => kpi,
            validateSyncResult: () => {},
          },
        ),
      /Azure indisponível/,
    );
    assert.equal(cache.getPlan("EndToEnd").state, "empty");
  });

  it("recusa refresh concorrente no mutex", () => {
    const cache = new InMemoryAzureCache();
    cache.beginRefresh();
    assert.throws(() => cache.beginRefresh(), /Refresh Azure já em andamento/);
    cache.endRefresh();
  });

  it("associa falhas com PlanKey normalizado (uat vs UAT)", async () => {
    const cache = new InMemoryAzureCache();
    const configuration = cfg();
    configuration.plans[1].planKey = "UAT";
    const ports: AzureRefreshPorts = {
      loadPlanExecutions: async (_client, plan) => planLoad(plan, [exec(plan.planKey)]),
      loadFalhas: async (): Promise<PlanFalhas[]> => [
        { plan: { ...configuration.plans[0] }, rows: [], bugMeta: new Map(), runCount: 0, resultCount: 0 },
        {
          plan: { ...configuration.plans[1], planKey: "uat" },
          rows: [falha("UAT", 42)],
          bugMeta: new Map(),
          runCount: 1,
          resultCount: 1,
        },
      ],
      calculateKpiImpactos: async () => kpi,
      validateSyncResult: () => {},
    };
    await refreshInMemoryAzureCache(cache, fakeClient, configuration, () => {}, ports);
    assert.equal(cache.getPlan("UAT").falhas[0]?.bug_id, 42);
  });

  it("getPlan devolve cópia defensiva", async () => {
    const cache = new InMemoryAzureCache();
    const ports: AzureRefreshPorts = {
      loadPlanExecutions: async (_client, plan) => planLoad(plan, [exec(plan.planKey)]),
      loadFalhas: async (): Promise<PlanFalhas[]> => [
        { plan: cfg().plans[0], rows: [], bugMeta: new Map(), runCount: 0, resultCount: 0 },
        { plan: cfg().plans[1], rows: [], bugMeta: new Map(), runCount: 0, resultCount: 0 },
      ],
      calculateKpiImpactos: async () => kpi,
      validateSyncResult: () => {},
    };
    await refreshInMemoryAzureCache(cache, fakeClient, cfg(), () => {}, ports);
    const view = cache.getPlan("EndToEnd");
    view.execucoes.push(exec("EndToEnd", 999));
    assert.equal(cache.getPlan("EndToEnd").execucoes.length, 1);
  });

  it("refresh não importa o módulo de persistência", async () => {
    const fs = await import("node:fs/promises");
    const refreshSrc = await fs.readFile(new URL("./azureDataRefresh.ts", import.meta.url), "utf8");
    const cacheSrc = await fs.readFile(new URL("./inMemoryAzureCache.ts", import.meta.url), "utf8");
    assert.equal(refreshSrc.includes("persistence/provider"), false);
    assert.equal(cacheSrc.includes("getStores"), false);
    assert.equal(refreshSrc.includes("replaceSnapshot"), false);
  });
});
