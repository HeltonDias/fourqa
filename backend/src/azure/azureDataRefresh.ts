import type { AzureClient } from "./client.js";
import type { SyncConfig } from "./config.js";
import { validateSyncResult } from "../domain/validateSync.js";
import type { AzureRefreshArtifacts } from "./azureDataPort.js";
import type { ExecucaoInsert, PlanExecutions } from "./execucoes.js";
import { loadPlanExecutions } from "./execucoes.js";
import type { FalhaInsert, PlanFalhas } from "./falhas.js";
import { loadFalhas } from "./falhas.js";
import type { BugMeta } from "./falhas.js";
import { calculateKpiImpactos, type KpiImpactos } from "./kpis.js";
import type { InMemoryAzureCache } from "./inMemoryAzureCache.js";
import { planKeyMatch } from "./planKeyMatch.js";
import type { ProgressReporter } from "./util.js";

const KPI_META_PREFIX = "kpi_impactos:";

export type AzureRefreshPorts = {
  loadPlanExecutions: typeof loadPlanExecutions;
  loadFalhas: typeof loadFalhas;
  calculateKpiImpactos: typeof calculateKpiImpactos;
  validateSyncResult: typeof validateSyncResult;
};

export const defaultAzureRefreshPorts: AzureRefreshPorts = {
  loadPlanExecutions,
  loadFalhas,
  calculateKpiImpactos,
  validateSyncResult,
};

export type AzureRefreshPlanDraft = {
  planKey: string;
  execucoes: ExecucaoInsert[];
  falhas: FalhaInsert[];
  dimensions: PlanExecutions["dimensions"];
  kpi: KpiImpactos | null;
};

export type AzureRefreshDraft = {
  kpiPlanKey: string;
  plans: AzureRefreshPlanDraft[];
  suiteRefs: { suiteId: number; parentSuiteId: number | null }[];
};

const noopReport: ProgressReporter = () => {};

/** Monta o rascunho sem publicar no cache (mesma ordem lógica de runSync, sem persistência). */
export async function buildAzureRefreshDraft(
  client: AzureClient,
  cfg: SyncConfig,
  report: ProgressReporter = noopReport,
  ports: AzureRefreshPorts = defaultAzureRefreshPorts,
): Promise<{ draft: AzureRefreshDraft; artifacts: AzureRefreshArtifacts }> {
  const execucoes: ExecucaoInsert[] = [];
  const suiteRefs: AzureRefreshDraft["suiteRefs"] = [];
  const dimensoesMeta: Record<string, string> = {};
  const perPlanExec = new Map<string, PlanExecutions>();
  let suites = 0;

  for (const plan of cfg.plans) {
    const load = await ports.loadPlanExecutions(client, plan, cfg.hierarchy, report, cfg.validFronts);
    perPlanExec.set(plan.planKey, load);
    execucoes.push(...load.rows);
    suiteRefs.push(...load.suites);
    suites += load.suitesProcessed;
    dimensoesMeta[`dimensoes_catalog:${plan.planKey}`] = JSON.stringify(load.dimensions);
  }

  const planFalhas: PlanFalhas[] = await ports.loadFalhas(client, cfg, report);
  const falhas: FalhaInsert[] = planFalhas.flatMap((p) => p.rows);
  const runs = planFalhas.reduce((n, p) => n + p.runCount, 0);

  const kpiPlan = planFalhas.find((p) => planKeyMatch(p.plan.planKey, cfg.kpiPlanKey));
  const bugMeta: Map<number, BugMeta> = kpiPlan?.bugMeta ?? new Map();
  const kpiExecs = execucoes.filter((e) => planKeyMatch(e.plan_key ?? "", cfg.kpiPlanKey));
  const kpi = await ports.calculateKpiImpactos(client, kpiExecs, bugMeta, report);

  ports.validateSyncResult({ execucoes, falhas, suites: suiteRefs });

  const fetchedAt = new Date().toISOString();
  const plans: AzureRefreshPlanDraft[] = cfg.plans.map((plan) => {
    const execLoad = perPlanExec.get(plan.planKey);
    const failLoad = planFalhas.find((p) => planKeyMatch(p.plan.planKey, plan.planKey));
    return {
      planKey: plan.planKey,
      execucoes: execLoad?.rows ?? [],
      falhas: failLoad?.rows ?? [],
      dimensions: execLoad?.dimensions ?? [],
      kpi: planKeyMatch(plan.planKey, cfg.kpiPlanKey) ? kpi : null,
    };
  });

  const artifacts: AzureRefreshArtifacts = {
    fetchedAt,
    dimensoesMeta,
    workbookMeta: {
      [`${KPI_META_PREFIX}${cfg.kpiPlanKey}`]: JSON.stringify(kpi),
      kpi_plan_key: cfg.kpiPlanKey,
      ultima_sincronizacao_azure: fetchedAt,
      ...dimensoesMeta,
    },
    summary: {
      execucoes: execucoes.length,
      falhas: falhas.length,
      suites,
      runs,
      kpi,
    },
  };

  return {
    draft: { kpiPlanKey: cfg.kpiPlanKey, plans, suiteRefs },
    artifacts,
  };
}

/** Atualiza o cache em memória; em falha preserva o lote anterior. Não grava em banco. */
export async function refreshInMemoryAzureCache(
  cache: InMemoryAzureCache,
  client: AzureClient,
  cfg: SyncConfig,
  report: ProgressReporter = noopReport,
  ports: AzureRefreshPorts = defaultAzureRefreshPorts,
): Promise<AzureRefreshArtifacts> {
  cache.beginRefresh();
  try {
    const { draft, artifacts } = await buildAzureRefreshDraft(client, cfg, report, ports);
    cache.commitSuccessfulRefresh(draft, artifacts);
    return artifacts;
  } catch (err) {
    cache.markRefreshFailed();
    throw err;
  } finally {
    cache.endRefresh();
  }
}
