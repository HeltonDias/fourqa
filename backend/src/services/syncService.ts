import { AzureClient, AzureHttpError } from "../azure/client.js";
import { loadSyncConfig, SyncConfigError, type SyncConfig } from "../azure/config.js";
import { loadPlanExecutions, type ExecucaoInsert } from "../azure/execucoes.js";
import { loadFalhas, type BugMeta, type FalhaInsert } from "../azure/falhas.js";
import { calculateKpiImpactos, type KpiImpactos } from "../azure/kpis.js";
import { getStores } from "../persistence/provider.js";
import { SyncValidationError, validateSyncResult } from "../domain/validateSync.js";

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

async function runSync(cfg: SyncConfig, startedAt: Date): Promise<void> {
  const client = new AzureClient(cfg.azure);
  const report = (step: string, done?: number, total?: number) =>
    patch({ step, progress: done !== undefined && total !== undefined ? { done, total } : null });

  const execucoes: ExecucaoInsert[] = [];
  const suiteRefs: { suiteId: number; parentSuiteId: number | null }[] = [];
  const dimensoesMeta: Record<string, string> = {};
  let suites = 0;
  for (const plan of cfg.plans) {
    const load = await loadPlanExecutions(client, plan, cfg.hierarchy, report, cfg.validFronts);
    execucoes.push(...load.rows);
    suiteRefs.push(...load.suites);
    suites += load.suitesProcessed;
    dimensoesMeta[`dimensoes_catalog:${plan.planKey}`] = JSON.stringify(load.dimensions);
  }
  const planFalhas = await loadFalhas(client, cfg, report);
  const falhas: FalhaInsert[] = planFalhas.flatMap((p) => p.rows);
  const runs = planFalhas.reduce((n, p) => n + p.runCount, 0);

  const kpiPlan = planFalhas.find((p) => p.plan.planKey.toLowerCase() === cfg.kpiPlanKey.toLowerCase());
  const bugMeta: Map<number, BugMeta> = kpiPlan?.bugMeta ?? new Map();
  const kpiExecs = execucoes.filter((e) => e.plan_key?.toLowerCase() === cfg.kpiPlanKey.toLowerCase());
  const kpi = await calculateKpiImpactos(client, kpiExecs, bugMeta, report);

  report("Validando integridade antes de gravar");
  validateSyncResult({ execucoes, falhas, suites: suiteRefs });

  report("Gravando no banco de dados");
  await (await getStores()).azureSnapshot.replaceSnapshot({
    execucoes,
    falhas,
    meta: {
      [`${KPI_META_PREFIX}${cfg.kpiPlanKey}`]: JSON.stringify(kpi),
      kpi_plan_key: cfg.kpiPlanKey,
      ultima_sincronizacao_azure: new Date().toISOString(),
      ...dimensoesMeta,
    },
  });

  const finishedAt = new Date();
  patch({
    status: "success",
    finishedAt: finishedAt.toISOString(),
    step: "Concluído",
    progress: null,
    summary: {
      execucoes: execucoes.length,
      falhas: falhas.length,
      suites,
      runs,
      kpi,
      duracaoMs: finishedAt.getTime() - startedAt.getTime(),
    },
  });
}
