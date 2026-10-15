import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { getDb } from "../db.js";
import { sqliteAzureSnapshotStore } from "../db/sqliteAzureSnapshotStore.js";
import type { AzureSnapshotStore, MetaStore } from "../persistence/contracts.js";
import type { ExecucaoRow, FalhaRow } from "../types.js";
import { persistValidatedSyncBatch } from "./azureCacheConsistency.js";
import type { AzureRefreshArtifacts } from "./azureDataPort.js";
import type { AzureRefreshDraft } from "./azureDataRefresh.js";
import {
  applyExperimentalAzureCacheRead,
  AzureCacheUnavailableError,
  createCacheFirstAzureReadSource,
  createCacheFirstMetaStore,
  isAzureCacheReadEnabled,
} from "./azureCacheReadSource.js";
import type { ExecucaoInsert } from "./execucoes.js";
import type { FalhaInsert } from "./falhas.js";
import { InMemoryAzureCache } from "./inMemoryAzureCache.js";

const dir = mkdtempSync(path.join(tmpdir(), "fourqa-cache-read-"));
process.env.FOURQA_DB = path.join(dir, "fourqa.db");

after(() => {
  getDb().close();
  rmSync(dir, { recursive: true, force: true });
});

function exec(planKey: string, point: number, title = "ct"): ExecucaoInsert {
  return {
    plan_key: planKey,
    plan_id: 10,
    plan_name: planKey,
    frente: "GEATE",
    atalho: null,
    processo: "Cadastro",
    suite_id: 1,
    suite_name: "suite",
    parent_suite_id: null,
    suite_depth: 1,
    suite_path: null,
    dimensions_json: null,
    test_point_id: point,
    test_case_id: point,
    test_case_title: title,
    responsabilidade: null,
    test_case_state: "Design",
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

function falha(planKey: string, bugId: number, titulo = "bug"): FalhaInsert {
  return {
    plan_key: planKey,
    responsavel: null,
    ambiente: null,
    categoria: null,
    bug_id: bugId,
    impacto: null,
    frente: "GEATE",
    titulo,
    status: "New",
    criacao: null,
    fechamento: null,
    links: null,
    tags: null,
  };
}

const kpi = { total: 3, foursys: 2, cliente: 3, reteste: 1, semResultadoMapeado: 0, calculadoEm: "2026-10-15T12:00:00.000Z" };

function artifacts(planKey = "EndToEnd"): AzureRefreshArtifacts {
  return {
    fetchedAt: "2026-10-15T12:00:00.000Z",
    dimensoesMeta: { [`dimensoes_catalog:${planKey}`]: "[{\"key\":\"front\"}]" },
    workbookMeta: {
      [`kpi_impactos:${planKey}`]: JSON.stringify(kpi),
      kpi_plan_key: planKey,
      ultima_sincronizacao_azure: "2026-10-15T12:00:00.000Z",
      [`dimensoes_catalog:${planKey}`]: "[{\"key\":\"front\"}]",
      [`dimensoes_catalog:UAT`]: "[]",
    },
    summary: { execucoes: 1, falhas: 1, suites: 1, runs: 0, kpi },
  };
}

function draft(): AzureRefreshDraft {
  return {
    kpiPlanKey: "EndToEnd",
    plans: [
      { planKey: "EndToEnd", execucoes: [exec("EndToEnd", 2, "Cadastro"), exec("EndToEnd", 1, "Outro")], falhas: [falha("EndToEnd", 7, "100%")], dimensions: [], kpi },
      { planKey: "UAT", execucoes: [], falhas: [falha("UAT", 42, "100_")], dimensions: [], kpi: null },
    ],
    suiteRefs: [],
  };
}

function countingSnapshot(execRows: ExecucaoRow[] = [], falhaRows: FalhaRow[] = []): AzureSnapshotStore & { calls: number } {
  const store = {
    calls: 0,
    replaceSnapshot: async () => {
      store.calls += 1;
    },
    async listExecucoes() {
      store.calls += 1;
      return execRows;
    },
    async listFalhas() {
      store.calls += 1;
      return falhaRows;
    },
    async queryExecucoes() {
      store.calls += 1;
      return { total: execRows.length, limit: 50, offset: 0, rows: execRows };
    },
    async queryFalhas() {
      store.calls += 1;
      return { total: falhaRows.length, limit: 50, offset: 0, rows: falhaRows };
    },
  };
  return store;
}

function memoryMeta(seed: Record<string, string>): MetaStore & { values: Map<string, string> } {
  const values = new Map(Object.entries(seed));
  return {
    values,
    get: (key) => values.get(key) ?? null,
    set: (key, value) => {
      values.set(key, value);
    },
    setMany: (entries) => {
      for (const [key, value] of Object.entries(entries)) values.set(key, value);
    },
  };
}

function withoutId<T extends { id: number }>(rows: T[]): Omit<T, "id">[] {
  return rows.map(({ id: _id, ...rest }) => rest);
}

/** case_priority fica no cache. O snapshot SQLite não tem essa coluna. */
function withoutSnapshotOnly(rows: Array<{ id: number; case_priority?: string | null }>) {
  return rows.map(({ id: _id, case_priority: _priority, ...rest }) => rest);
}

describe("leitura experimental pelo cache", () => {
  it("flag desligada preserva o store legado", () => {
    const previous = process.env.AZURE_CACHE_READ;
    delete process.env.AZURE_CACHE_READ;
    const snapshot = countingSnapshot();
    const stores = applyExperimentalAzureCacheRead(
      { meta: memoryMeta({}), azureSnapshot: snapshot, legacyPlan: { listBase: () => [] }, planning: {} as never },
      new InMemoryAzureCache(),
    );
    assert.equal(isAzureCacheReadEnabled(), false);
    assert.equal(stores.azureSnapshot, snapshot);
    if (previous === undefined) delete process.env.AZURE_CACHE_READ;
    else process.env.AZURE_CACHE_READ = previous;
  });

  it("PlanKey vazio na query falha e o ausente no lote loaded não consulta o snapshot", async () => {
    const cache = new InMemoryAzureCache();
    cache.commitSuccessfulRefresh(draft(), artifacts());
    const snapshot = countingSnapshot();
    const source = createCacheFirstAzureReadSource(cache, snapshot);
    await assert.rejects(async () => { await source.queryExecucoes({ limit: 10, offset: 0, q: "" }); }, /planKey obrigatório/);
    await assert.rejects(async () => { await source.queryFalhas({ planKey: "   ", limit: 10, offset: 0, q: "" }); }, /planKey obrigatório/);
    const missing = await source.queryExecucoes({ planKey: "Inexistente", limit: 10, offset: 0, q: "" });
    assert.equal(missing.total, 0);
    assert.equal(snapshot.calls, 0);
    assert.deepEqual(await source.listExecucoes(""), []);
    assert.equal(snapshot.calls, 0);
  });

  it("normaliza caixa, isola planos e distingue UAT vazio de ausente", async () => {
    const cache = new InMemoryAzureCache();
    cache.commitSuccessfulRefresh(draft(), artifacts());
    const snapshot = countingSnapshot([{ id: 99, ...exec("EndToEnd", 99) }]);
    const source = createCacheFirstAzureReadSource(cache, snapshot);
    const e2e = await source.listExecucoes(" endtoend ");
    const uatExec = await source.listExecucoes("uat");
    const uatBugs = await source.listFalhas("UAT");
    const e2eBugs = await source.listFalhas("EndToEnd");
    assert.deepEqual(e2e.map((row) => row.test_point_id), [2, 1]);
    assert.deepEqual(e2e.map((row) => row.id), [2, 1]);
    assert.equal(uatExec.length, 0);
    assert.equal(cache.getPlan("UAT").state, "loaded");
    assert.deepEqual(uatBugs.map((row) => row.bug_id), [42]);
    assert.deepEqual(e2eBugs.map((row) => row.bug_id), [7]);
    assert.equal(snapshot.calls, 0);
  });

  it("pagina, ordena e busca como o snapshot SQLite", async () => {
    const cache = new InMemoryAzureCache();
    const batch = draft();
    cache.commitSuccessfulRefresh(batch, artifacts());
    const snapshot = sqliteAzureSnapshotStore;
    snapshot.replaceSnapshot({
      execucoes: batch.plans.flatMap((plan) => plan.execucoes),
      falhas: batch.plans.flatMap((plan) => plan.falhas),
      meta: artifacts().workbookMeta,
    });
    let snapshotReads = 0;
    const guarded: AzureSnapshotStore = {
      replaceSnapshot: snapshot.replaceSnapshot,
      listExecucoes: (planKey) => {
        snapshotReads += 1;
        return snapshot.listExecucoes(planKey);
      },
      listFalhas: (planKey) => {
        snapshotReads += 1;
        return snapshot.listFalhas(planKey);
      },
      queryExecucoes: (params) => {
        snapshotReads += 1;
        return snapshot.queryExecucoes(params);
      },
      queryFalhas: (params) => {
        snapshotReads += 1;
        return snapshot.queryFalhas(params);
      },
    };
    const source = createCacheFirstAzureReadSource(cache, guarded);
    const params = { planKey: "EndToEnd", limit: 1, offset: 1, q: "" };
    const fromCache = await source.queryExecucoes(params);
    const fromDb = snapshot.queryExecucoes(params);
    assert.equal(fromCache.total, fromDb.total);
    assert.deepEqual(withoutSnapshotOnly(fromCache.rows), withoutSnapshotOnly(fromDb.rows));
    const search = await source.queryExecucoes({ planKey: "EndToEnd", limit: 10, offset: 0, q: "CADASTRO" });
    const searchDb = snapshot.queryExecucoes({ planKey: "EndToEnd", limit: 10, offset: 0, q: "CADASTRO" });
    assert.deepEqual(withoutSnapshotOnly(search.rows), withoutSnapshotOnly(searchDb.rows));
    const percent = await source.queryFalhas({ planKey: "EndToEnd", limit: 10, offset: 0, q: "100%" });
    const percentDb = snapshot.queryFalhas({ planKey: "EndToEnd", limit: 10, offset: 0, q: "100%" });
    assert.equal(percent.total, 1);
    assert.deepEqual(withoutId(percent.rows), withoutId(percentDb.rows));
    const underscore = await source.queryFalhas({ planKey: "uat", limit: 10, offset: 0, q: "100_" });
    assert.equal(underscore.rows[0]?.bug_id, 42);
    const other = await source.queryExecucoes({ planKey: "UAT", limit: 10, offset: 0, q: "" });
    assert.equal(other.total, 0);
    assert.equal(snapshotReads, 0);
  });

  it("serve KPI e catálogo da mesma geração e ignora meta antiga do banco", async () => {
    const cache = new InMemoryAzureCache();
    cache.commitSuccessfulRefresh(draft(), artifacts());
    const meta = createCacheFirstMetaStore(
      cache,
      memoryMeta({
        "kpi_impactos:EndToEnd": JSON.stringify({ ...kpi, foursys: 0 }),
        "dimensoes_catalog:EndToEnd": "antiga",
        cabecalho_titulo: "Home",
      }),
    );
    assert.equal(JSON.parse((await meta.get("kpi_impactos:endtoend")) ?? "").foursys, 2);
    assert.equal(await meta.get("dimensoes_catalog:EndToEnd"), "[{\"key\":\"front\"}]");
    assert.equal(await meta.get("cabecalho_titulo"), "Home");
    assert.equal(await meta.get("dimensoes_catalog:Sumiu"), null);
  });

  it("cache nunca carregado falha e o stale continua no lote anterior", async () => {
    const empty = new InMemoryAzureCache();
    const snap = countingSnapshot([{ id: 5, ...exec("EndToEnd", 5, "atual") }]);
    const source = createCacheFirstAzureReadSource(empty, snap);
    await assert.rejects(async () => {
      await source.listExecucoes("EndToEnd");
    }, AzureCacheUnavailableError);
    assert.equal(snap.calls, 0);
    const meta = createCacheFirstMetaStore(empty, memoryMeta({ "kpi_impactos:EndToEnd": "{\"foursys\":9}" }));
    assert.equal(await meta.get("kpi_impactos:EndToEnd"), null);
    assert.equal(await meta.get("cabecalho_titulo"), null);

    const cache = new InMemoryAzureCache();
    cache.commitSuccessfulRefresh(draft(), artifacts());
    cache.markRefreshFailed();
    const staleSnap = countingSnapshot([{ id: 5, ...exec("EndToEnd", 5, "atual") }]);
    const stale = createCacheFirstAzureReadSource(cache, staleSnap);
    assert.equal((await stale.listExecucoes("EndToEnd"))[0]?.test_point_id, 2);
    assert.equal(staleSnap.calls, 0);
    assert.equal(cache.getPlan("EndToEnd").state, "stale");
  });

  it("falha de banco preserva a geração e falha de espelho não publica o cache", async () => {
    const cache = new InMemoryAzureCache();
    cache.commitSuccessfulRefresh(draft(), artifacts());
    const blocked = countingSnapshot();
    await assert.rejects(
      () => persistValidatedSyncBatch(draft(), artifacts(), {
        replaceSnapshot: async () => {
          throw new Error("banco indisponível");
        },
        mirrorEnabled: () => true,
        cache,
      }),
      /banco indisponível/,
    );
    const source = createCacheFirstAzureReadSource(cache, blocked);
    assert.equal((await source.listExecucoes("EndToEnd"))[0]?.test_point_id, 2);
    assert.equal(blocked.calls, 0);

    const current = [{ id: 8, ...exec("EndToEnd", 8, "banco-novo") }];
    const afterFail = countingSnapshot(current);
    cache.beginRefresh();
    await persistValidatedSyncBatch(draft(), artifacts(), {
      replaceSnapshot: async () => {},
      mirrorEnabled: () => true,
      cache,
    });
    cache.endRefresh();
    const fallen = createCacheFirstAzureReadSource(cache, afterFail);
    assert.equal((await fallen.listExecucoes("EndToEnd"))[0]?.test_point_id, 2);
    assert.equal(afterFail.calls, 0);
    assert.equal(cache.getRefreshMeta().stale, true);
  });

  it("publicação e sync sem espelho não misturam o snapshot", async () => {
    const cache = new InMemoryAzureCache();
    cache.commitSuccessfulRefresh(draft(), artifacts());
    const snap = countingSnapshot([{ id: 3, ...exec("EndToEnd", 3, "durante") }]);
    const source = createCacheFirstAzureReadSource(cache, snap);
    cache.beginPublish();
    assert.equal((await source.listExecucoes("EndToEnd"))[0]?.test_point_id, 2);
    assert.equal(snap.calls, 0);
    cache.endPublish();

    let replaced = 0;
    const meta = memoryMeta({ cabecalho_titulo: "Home" });
    await persistValidatedSyncBatch(draft(), artifacts(), {
      replaceSnapshot: async () => {
        replaced += 1;
      },
      mirrorEnabled: () => false,
      cacheReadEnabled: () => true,
      setBatchMeta: async (batch) => {
        for (const [key, value] of Object.entries(batch)) await meta.set(key, value);
      },
      cache,
    });
    assert.equal(replaced, 0);
    assert.equal(await meta.get("cabecalho_titulo"), "Home");
    assert.equal(await meta.get("kpi_plan_key"), "EndToEnd");
    assert.equal((await source.listExecucoes("EndToEnd"))[0]?.test_point_id, 2);
    assert.equal(snap.calls, 0);
    assert.throws(() => source.replaceSnapshot({ execucoes: [], falhas: [], meta: {} }), /snapshot desligada/);
  });
});
