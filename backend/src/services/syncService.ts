import { AzureClient, AzureHttpError } from "../azure/client.js";
import { isAzureCacheMirrorEnabled } from "../azure/azureCacheMirror.js";
import { persistValidatedSyncBatch } from "../azure/azureCacheConsistency.js";
import { buildAzureRefreshDraft, defaultAzureRefreshPorts } from "../azure/azureDataRefresh.js";
import { isAzureCacheReadEnabled } from "../azure/azureCacheReadSource.js";
import { getInMemoryAzureCache } from "../azure/inMemoryAzureCache.js";
import { loadSyncConfig, SyncConfigError, type SyncConfig } from "../azure/config.js";
import { getStores } from "../persistence/provider.js";
import { SyncValidationError } from "../domain/validateSync.js";
import {
  claimSyncJob,
  isDurableSyncRuntime,
  readSyncJob,
  saveSyncJob,
  type SyncState,
} from "./syncJob.js";

export { SyncConfigError };
export type { SyncState };

export const KPI_META_PREFIX = "kpi_impactos:";

let state: SyncState = {
  status: "idle",
  startedAt: null,
  finishedAt: null,
  step: "",
  progress: null,
  summary: null,
  error: null,
};

export async function getSyncState(): Promise<SyncState> {
  if (!isDurableSyncRuntime()) return state;
  return readSyncJob(Date.now());
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
export async function startSync(): Promise<{ started: boolean; state: SyncState }> {
  if (isDurableSyncRuntime()) return startDurableSync();
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

/** Na Vercel a Promise da sincronização fica registrada em waitUntil e o estado vai para o Postgres. */
async function startDurableSync(): Promise<{ started: boolean; state: SyncState }> {
  const cfg = loadSyncConfig();
  const startedAt = new Date();
  const claimed = await claimSyncJob(startedAt);
  if (!claimed.started) return claimed;
  state = claimed.state;
  const work = runSync(cfg, startedAt);
  const { waitUntil } = await import("@vercel/functions");
  waitUntil(work);
  return claimed;
}

export async function runSync(cfg: SyncConfig, startedAt: Date): Promise<void> {
  const client = new AzureClient(cfg.azure);
  const durable = isDurableSyncRuntime();
  let queue = Promise.resolve();
  let acceptBeat = true;
  const persistJob = () => {
    if (!durable) return;
    const snapshot = { ...state, beatAt: new Date().toISOString() };
    queue = queue.then(() => saveSyncJob(snapshot)).catch((err: unknown) => {
      console.error("[sync] estado não gravado:", err instanceof Error ? err.name : "erro");
    });
  };
  const report = (step: string, done?: number, total?: number) => {
    patch({ step, progress: done !== undefined && total !== undefined ? { done, total } : null });
    persistJob();
  };
  const beat = durable
    ? setInterval(() => {
        if (acceptBeat) persistJob();
      }, 20_000)
    : null;

  const cache = getInMemoryAzureCache();
  const cacheRead = isAzureCacheReadEnabled();
  let locked = false;
  if (cacheRead) {
    cache.beginRefresh();
    locked = true;
  }
  const stopBeat = () => {
    acceptBeat = false;
    if (beat) clearInterval(beat);
  };
  try {
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
      cache,
      });

      stopBeat();
      await queue;
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
      if (durable) {
        persistJob();
        await queue;
      }
    } catch (err) {
      stopBeat();
      await queue;
      if (locked) cache.markRefreshFailed();
      if (!durable) throw err;
      console.error("[sync] falhou:", err instanceof Error ? `${err.name}: ${err.message}` : "erro desconhecido");
      patch({ status: "error", finishedAt: new Date().toISOString(), progress: null, error: userMessage(err) });
      persistJob();
      await queue;
    }
  } finally {
    stopBeat();
    if (locked) cache.endRefresh();
  }
}
