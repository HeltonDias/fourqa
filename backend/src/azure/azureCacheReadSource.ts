import { envValue } from "./config.js";
import type { AzureSnapshotStore, MetaStore, PersistenceStores } from "../persistence/contracts.js";
import type { ExecucaoRow, FalhaRow } from "../types.js";
import { planKeyMatch } from "./planKeyMatch.js";
import { EXEC_SEARCH, FALHA_SEARCH, listCachedRows, pageCachedRows } from "./azureCacheQuery.js";
import { requiredPlanKey } from "../persistence/planKey.js";
import type { InMemoryAzureCache } from "./inMemoryAzureCache.js";
import { getInMemoryAzureCache } from "./inMemoryAzureCache.js";

/** Cache ligado com AZURE_CACHE_READ=1, desligado com 0. No PostgreSQL da API, o padrão é ligado. */
export function isAzureCacheReadEnabled(): boolean {
  const flag = envValue("AZURE_CACHE_READ");
  if (flag === "1") return true;
  if (flag === "0") return false;
  return envValue("DB_PROVIDER").trim().toLowerCase() === "postgres";
}

/** O modo cache ainda não tem geração. Não é o mesmo que um plano carregado sem linhas. */
export class AzureCacheUnavailableError extends Error {
  constructor() {
    super("Dados do Azure ainda não foram carregados. Use Atualizar.");
    this.name = "AzureCacheUnavailableError";
  }
}

const BATCH_EXACT = new Set(["kpi_plan_key", "ultima_sincronizacao_azure"]);
const BATCH_PREFIX = ["dimensoes_catalog:", "kpi_impactos:"];

function isBatchMetaKey(key: string): boolean {
  return BATCH_EXACT.has(key) || BATCH_PREFIX.some((prefix) => key.startsWith(prefix));
}

/** Catálogo, KPI e instante do refresh só da geração servida. Ausente na geração devolve null. */
export function readBatchMeta(meta: Record<string, string>, key: string): string | null {
  if (Object.prototype.hasOwnProperty.call(meta, key)) return meta[key] ?? null;
  for (const prefix of BATCH_PREFIX) {
    if (!key.startsWith(prefix)) continue;
    const want = key.slice(prefix.length);
    for (const [stored, value] of Object.entries(meta)) {
      if (stored.startsWith(prefix) && planKeyMatch(stored.slice(prefix.length), want)) return value;
    }
    return null;
  }
  return null;
}

function publishedRows<T>(cache: InMemoryAzureCache, planKey: string, pick: "execucoes" | "falhas"): T[] {
  if (!cache.hasPublishedGeneration()) throw new AzureCacheUnavailableError();
  const view = cache.getPlan(planKey);
  if (view.state === "empty") return [];
  return (view[pick] as T[]).map((row) => ({ ...row }));
}

/**
 * Com geração publicada, execuções e falhas vêm só do cache.
 * Sem geração, a leitura falha em vez de consultar o snapshot ou devolver zero confirmado.
 */
export function createCacheFirstAzureReadSource(
  cache: InMemoryAzureCache,
  snapshot: AzureSnapshotStore,
): AzureSnapshotStore {
  void snapshot;
  return {
    replaceSnapshot() {
      throw new Error("Persistência de snapshot desligada no modo cache.");
    },
    async listExecucoes(planKey) {
      return listCachedRows(publishedRows<ExecucaoRow>(cache, planKey, "execucoes"));
    },
    async listFalhas(planKey) {
      return listCachedRows(publishedRows<FalhaRow>(cache, planKey, "falhas"));
    },
    async queryExecucoes(params) {
      const planKey = requiredPlanKey(params.planKey);
      return pageCachedRows(publishedRows(cache, planKey, "execucoes"), EXEC_SEARCH, { ...params, planKey });
    },
    async queryFalhas(params) {
      const planKey = requiredPlanKey(params.planKey);
      return pageCachedRows(publishedRows(cache, planKey, "falhas"), FALHA_SEARCH, { ...params, planKey });
    },
  };
}

/** Metadados do refresh acompanham a geração do cache. Cabeçalho e período continuam no banco. */
export function createCacheFirstMetaStore(cache: InMemoryAzureCache, meta: MetaStore): MetaStore {
  return {
    async get(key) {
      if (!isBatchMetaKey(key)) return meta.get(key);
      const generation = cache.readGeneration();
      if (!generation) return null;
      return readBatchMeta(generation.meta, key);
    },
    set(key, value) {
      return meta.set(key, value);
    },
    setMany(entries) {
      return meta.setMany(entries);
    },
  };
}

/** Flag desligada devolve os mesmos stores. Ligada não altera o default do processo. */
export function applyExperimentalAzureCacheRead(
  stores: PersistenceStores,
  cache: InMemoryAzureCache = getInMemoryAzureCache(),
): PersistenceStores {
  if (!isAzureCacheReadEnabled()) return stores;
  return {
    ...stores,
    meta: createCacheFirstMetaStore(cache, stores.meta),
    azureSnapshot: createCacheFirstAzureReadSource(cache, stores.azureSnapshot),
  };
}
