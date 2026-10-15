import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AzureRefreshArtifacts } from "./azureDataPort.js";
import type { AzureRefreshDraft } from "./azureDataRefresh.js";
import { persistValidatedSyncBatch } from "./azureCacheConsistency.js";
import { InMemoryAzureCache } from "./inMemoryAzureCache.js";
import type { ExecucaoInsert } from "./execucoes.js";
import type { FalhaInsert } from "./falhas.js";

function draft(planKey = "EndToEnd"): AzureRefreshDraft {
  const row: ExecucaoInsert = {
    plan_key: planKey,
    plan_id: 1,
    plan_name: planKey,
    frente: null,
    atalho: null,
    processo: null,
    suite_id: 1,
    suite_name: "s",
    parent_suite_id: null,
    suite_depth: 1,
    suite_path: null,
    dimensions_json: null,
    test_point_id: 1,
    test_case_id: 1,
    test_case_title: "t",
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
  return {
    kpiPlanKey: planKey,
    plans: [{ planKey, execucoes: [row], falhas: [], dimensions: [], kpi: null }],
    suiteRefs: [{ suiteId: 1, parentSuiteId: null }],
  };
}

function artifacts(planKey = "EndToEnd"): AzureRefreshArtifacts {
  return {
    fetchedAt: "2026-10-14T18:00:00.000Z",
    dimensoesMeta: { [`dimensoes_catalog:${planKey}`]: "[]" },
    workbookMeta: {
      kpi_plan_key: planKey,
      ultima_sincronizacao_azure: "2026-10-14T18:00:00.000Z",
    },
    summary: { execucoes: 1, falhas: 0, suites: 1, runs: 0, kpi: null },
  };
}

describe("persistValidatedSyncBatch", () => {
  it("com espelho desligado só chama replaceSnapshot", async () => {
    const cache = new InMemoryAzureCache();
    let replaced = 0;
    await persistValidatedSyncBatch(draft(), artifacts(), {
      replaceSnapshot: async () => {
        replaced += 1;
      },
      mirrorEnabled: () => false,
      cache,
    });
    assert.equal(replaced, 1);
    assert.equal(cache.getPlan("EndToEnd").state, "empty");
  });

  it("com espelho ligado atualiza banco e cache com o mesmo meta", async () => {
    const cache = new InMemoryAzureCache();
    const captured: { meta?: Record<string, string> } = {};
    await persistValidatedSyncBatch(draft(), artifacts(), {
      replaceSnapshot: async (input) => {
        captured.meta = input.meta;
      },
      mirrorEnabled: () => true,
      cache,
    });
    assert.equal(captured.meta?.kpi_plan_key, "EndToEnd");
    assert.equal(cache.getPlan("EndToEnd").state, "loaded");
    assert.equal(cache.getRefreshMeta().stale, false);
  });

  it("falha no banco não publica no cache", async () => {
    const cache = new InMemoryAzureCache();
    await cache.commitSuccessfulRefresh(draft("PlanoA"), artifacts("PlanoA"));
    await assert.rejects(
      () =>
        persistValidatedSyncBatch(draft("PlanoB"), artifacts("PlanoB"), {
          replaceSnapshot: async () => {
            throw new Error("banco indisponível");
          },
          mirrorEnabled: () => true,
          cache,
        }),
      /banco indisponível/,
    );
    assert.equal(cache.getPlan("PlanoA").state, "loaded");
    assert.equal(cache.listLoadedPlanKeys().join(","), "PlanoA");
  });

  it("banco ok e falha no espelho mantém lote anterior como stale", async () => {
    const cache = new InMemoryAzureCache();
    await persistValidatedSyncBatch(draft(), artifacts(), {
      replaceSnapshot: async () => {},
      mirrorEnabled: () => true,
      cache,
    });
    const before = cache.getPlan("EndToEnd").execucoes[0]?.test_point_id;

    cache.beginRefresh();
    const next = draft();
    next.plans[0]!.execucoes[0]!.test_point_id = 99;
    await persistValidatedSyncBatch(next, artifacts(), {
      replaceSnapshot: async () => {},
      mirrorEnabled: () => true,
      cache,
    });
    cache.endRefresh();

    assert.equal(cache.getPlan("EndToEnd").execucoes[0]?.test_point_id, before);
    assert.equal(cache.getPlan("EndToEnd").state, "stale");
    assert.equal(cache.getRefreshMeta().stale, true);
  });

  it("modo cache publica sem replaceSnapshot e o segundo refresh não entra", async () => {
    const cache = new InMemoryAzureCache();
    cache.beginRefresh();
    let replaced = 0;
    const meta: Record<string, string> = {};
    await persistValidatedSyncBatch(draft(), artifacts(), {
      replaceSnapshot: async () => {
        replaced += 1;
      },
      mirrorEnabled: () => true,
      cacheReadEnabled: () => true,
      setBatchMeta: async (batch) => {
        Object.assign(meta, batch);
      },
      cache,
    });
    assert.equal(replaced, 0);
    assert.equal(meta.kpi_plan_key, "EndToEnd");
    assert.equal(cache.getPlan("EndToEnd").state, "loaded");
    assert.throws(() => cache.beginRefresh(), /já em andamento/);
    cache.endRefresh();
  });

  it("falha nas metas não publica o cache e propaga o erro", async () => {
    const cache = new InMemoryAzureCache();
    cache.commitSuccessfulRefresh(draft("PlanoA"), artifacts("PlanoA"));
    await assert.rejects(
      () => persistValidatedSyncBatch(draft("PlanoB"), artifacts("PlanoB"), {
        replaceSnapshot: async () => {
          throw new Error("não devia gravar snapshot");
        },
        mirrorEnabled: () => false,
        cacheReadEnabled: () => true,
        setBatchMeta: async () => {
          throw new Error("meta rejeitada");
        },
        cache,
      }),
      /meta rejeitada/,
    );
    assert.equal(cache.getPlan("PlanoA").state, "loaded");
    assert.equal(cache.getPlan("PlanoB").state, "empty");
  });
});
