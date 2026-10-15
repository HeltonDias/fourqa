import { AzureClient, AzureHttpError } from "../azure/client.js";
import { isAzureCacheMirrorEnabled } from "../azure/azureCacheMirror.js";
import { persistValidatedSyncBatch } from "../azure/azureCacheConsistency.js";
import { buildAzureRefreshDraft, defaultAzureRefreshPorts } from "../azure/azureDataRefresh.js";
import { isAzureCacheReadEnabled } from "../azure/azureCacheReadSource.js";
import { getInMemoryAzureCache } from "../azure/inMemoryAzureCache.js";
import { loadSyncConfig, SyncConfigError, type SyncConfig } from "../azure/config.js";
import type { KpiImpactos } from "../azure/kpis.js";
import { getStores } from "../persistence/provider.js";
import { SyncValidationError } from "../domain/validateSync.js";

export { SyncConfigError };

export const KPI_META_PREFIX = "kpi_impactos:";

export interface SyncState {
  status: "idle" | "running" | "success" | "error";
  startedAt: string | null;
  finishedAt: string | null;
  step: string;
  progress: { done: number; total: number } | null;
  summary: {
    execucoes: number;
    falhas: number;
    suites: number;
    runs: number;
    kpi: KpiImpactos | null;
    duracaoMs: number;
  } | null;
  error: string | null;
}

let state: SyncState = {
  status: "idle",
  startedAt: null,
  finishedAt: null,
  step: "",
  progress: null,
  summary: null,
  error: null,
};

export function getSyncState(): SyncState {
  return state;
}

function patch(p: Partial<SyncState>): void {
  state = { ...state, ...p };
}

/** Mensagem segura para o usuário: nunca devolve stack, URL com credenciais nem o PAT. */
function userMessage(err: unknown): string {
  if (err instanceof SyncConfigError || err instanceof AzureHttpError || err instanceof SyncValidationError) return err.message;
  return "Falha inesperada durante a sincronização com o Azure DevOps. Consulte o log do servidor.";
}

/**
 * Inicia a sincronização em segundo plano. Lança SyncConfigError (síncrono) se a configuração
 * estiver incompleta, para a API responder 400 sem iniciar nada.
 */
export function startSync(): { started: boolean; state: SyncState } {
  if (state.status === "running") return { started: false, state };

  const cfg = loadSyncConfig();
  const startedAt = new Date();
  state = {
    status: "running",
    startedAt: startedAt.toISOString(),
    finishedAt: null,
    step: "Iniciando",
    progress: null,
    summary: null,
    error: null,
  };

  void runSync(cfg, startedAt).catch((err: unknown) => {
    console.error("[sync] falhou:", err instanceof Error ? `${err.name}: ${err.message}` : "erro desconhecido");
    patch({ status: "error", finishedAt: new Date().toISOString(), progress: null, error: userMessage(err) });
  });

  return { started: true, state };
}

export async function runSync(cfg: SyncConfig, startedAt: Date): Promise<void> {
  const client = new AzureClient(cfg.azure);
  const report = (step: string, done?: number, total?: number) =>
    patch({ step, progress: done !== undefined && total !== undefined ? { done, total } : null });

  const cache = getInMemoryAzureCache();
  const cacheRead = isAzureCacheReadEnabled();
  let locked = false;
  if (cacheRead) {
    cache.beginRefresh();
    locked = true;
  }
  try {
    const { draft, artifacts } = await buildAzureRefreshDraft(client, cfg, report, defaultAzureRefreshPorts);

    report("Validando integridade antes de gravar");
    report(cacheRead ? "Publicando a atualização" : "Gravando no banco de dados");
    const stores = await getStores();
    await persistValidatedSyncBatch(draft, artifacts, {
      replaceSnapshot: async (input) => {
        await stores.azureSnapshot.replaceSnapshot(input);
      },
      mirrorEnabled: isAzureCacheMirrorEnabled,
      cacheReadEnabled: () => cacheRead,
      setBatchMeta: async (meta) => {
        await stores.meta.setMany(meta);
      },
      cache,
    });

    const finishedAt = new Date();
    patch({
      status: "success",
      finishedAt: finishedAt.toISOString(),
      step: "Concluído",
      progress: null,
      summary: {
        execucoes: artifacts.summary.execucoes,
        falhas: artifacts.summary.falhas,
        suites: artifacts.summary.suites,
        runs: artifacts.summary.runs,
        kpi: artifacts.summary.kpi,
        duracaoMs: finishedAt.getTime() - startedAt.getTime(),
      },
    });
  } catch (err) {
    if (locked) cache.markRefreshFailed();
    throw err;
  } finally {
    if (locked) cache.endRefresh();
  }
}
