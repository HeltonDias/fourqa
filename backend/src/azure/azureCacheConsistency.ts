import type { AzureRefreshArtifacts } from "./azureDataPort.js";
import type { AzureRefreshDraft } from "./azureDataRefresh.js";
import type { InMemoryAzureCache } from "./inMemoryAzureCache.js";
import type { AzureSnapshot } from "../db/sqliteAzureSnapshotStore.js";

export type SyncPersistDeps = {
  replaceSnapshot: (input: AzureSnapshot) => Promise<void>;
  mirrorEnabled: () => boolean;
  /** Ligado: publica só o cache. Não grava meta nem linhas no SQL. */
  cacheReadEnabled?: () => boolean;
  cache: InMemoryAzureCache;
};

/**
 * Política cache ↔ banco:
 * 1. Um único draft/artifacts alimenta replaceSnapshot e o espelho.
 * 2. Durante a gravação o cache não é servido (evita lote antigo com meta nova).
 * 3. Falha em replaceSnapshot: cache anterior permanece loaded, se já existia.
 * 4. Sucesso sem espelho: cache anterior fica stale; a leitura usa o banco.
 * 5. Sucesso com espelho: commit da mesma geração; falha no espelho marca stale
 *    e o sync continua sucesso, sem reverter o banco.
 * 6. Modo cache não grava meta de lote no SQL. Meta sem as linhas faria a Vercel
 *    ler KPI novo sobre execuções velhas.
 */
export async function persistValidatedSyncBatch(
  draft: AzureRefreshDraft,
  artifacts: AzureRefreshArtifacts,
  deps: SyncPersistDeps,
): Promise<void> {
  if (deps.cacheReadEnabled?.()) {
    deps.cache.commitSuccessfulRefresh(draft, artifacts);
    return;
  }

  const execucoes = draft.plans.flatMap((plan) => plan.execucoes);
  const falhas = draft.plans.flatMap((plan) => plan.falhas);

  deps.cache.beginPublish();
  try {
    await deps.replaceSnapshot({
      execucoes,
      falhas,
      meta: artifacts.workbookMeta,
    });

    if (!deps.mirrorEnabled()) {
      deps.cache.markRefreshFailed();
      return;
    }

    try {
      if (deps.cache.isRefreshing()) {
        throw new Error("Cache Azure ocupado por outro refresh.");
      }
      deps.cache.commitSuccessfulRefresh(draft, artifacts);
    } catch (err) {
      console.error(
        "[sync] espelho do cache falhou:",
        err instanceof Error ? err.name : "erro desconhecido",
      );
      deps.cache.markRefreshFailed();
    }
  } finally {
    deps.cache.endPublish();
  }
}
