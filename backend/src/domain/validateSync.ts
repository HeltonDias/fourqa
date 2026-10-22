import type { PlanConfig, SyncConfig } from "../azure/config.js";
import { planKeyMatch } from "../azure/planKeyMatch.js";
import type { ExecucaoInsert } from "../azure/execucoes.js";
import type { FalhaInsert } from "../azure/falhas.js";
import { classifyExecution, type StatusCenario } from "./formulas.js";

export interface SyncSuiteRef {
  suiteId: number;
  parentSuiteId: number | null;
}

export class SyncValidationError extends Error {
  constructor(readonly errors: string[]) {
    super(errors.join(" "));
    this.name = "SyncValidationError";
  }
}

const STATUS: StatusCenario[] = ["passed", "na", "falhado", "bloqueado", "design", "naoLiberado", "liberado"];

/**
 * FETCH → TRANSFORM → VALIDATE → COMMIT.
 * Erro crítico impede o replace: os dados anteriores permanecem.
 */
export function validateSyncResult(input: {
  execucoes: ExecucaoInsert[];
  falhas: FalhaInsert[];
  suites: SyncSuiteRef[];
}): void {
  const errors: string[] = [];

  if (input.execucoes.length === 0) {
    errors.push("Nenhum Test Point retornado. A sincronização foi cancelada para não apagar os dados atuais.");
  }

  const points = new Set<string>();
  const buckets = Object.fromEntries(STATUS.map((s) => [s, 0])) as Record<StatusCenario, number>;

  for (const row of input.execucoes) {
    if (!row.plan_key?.trim() || !row.plan_id) {
      errors.push("Execução sem PlanKey ou PlanId.");
      break;
    }
    if (!row.suite_id) {
      errors.push(`Test point ${row.test_point_id ?? "?"} sem suíte.`);
      break;
    }
    if (row.test_point_id) {
      const key = `${row.plan_key}:${row.test_point_id}`;
      if (points.has(key)) errors.push(`TestPointId duplicado no plano ${row.plan_key}: ${row.test_point_id}.`);
      points.add(key);
    }
    buckets[classifyExecution(row)]++;
  }

  const classified = STATUS.reduce((n, s) => n + buckets[s], 0);
  if (input.execucoes.length > 0 && classified !== input.execucoes.length) {
    errors.push(
      `Invariante de status violada: classificados ${classified}, execuções ${input.execucoes.length}.`,
    );
  }

  const bugs = new Set<string>();
  for (const row of input.falhas) {
    if (!row.bug_id || !row.plan_key) continue;
    const key = `${row.plan_key}:${row.bug_id}`;
    if (bugs.has(key)) errors.push(`BugId duplicado no plano ${row.plan_key}: ${row.bug_id}.`);
    bugs.add(key);
  }

  const suiteIds = new Set(input.suites.map((s) => s.suiteId));
  for (const suite of input.suites) {
    if (suite.parentSuiteId != null && !suiteIds.has(suite.parentSuiteId)) {
      errors.push(`Suíte ${suite.suiteId} aponta para o pai ${suite.parentSuiteId}, que não está na árvore.`);
      break;
    }
  }

  if (errors.length > 0) throw new SyncValidationError([...new Set(errors)]);
}

/** Plano da configuração na hora de publicar. Loaded falso = plano ausente no lote. */
export type SyncPlanGate = {
  planKey: string;
  suiteFilter: boolean;
  maxSuites: boolean;
  loaded: boolean;
};

export function syncPlanGatesFromConfig(cfg: SyncConfig, loaded: boolean): SyncPlanGate[] {
  return cfg.plans.map((plan) => syncPlanGateFromConfig(plan, loaded));
}

export function syncPlanGateFromConfig(plan: PlanConfig, loaded: boolean): SyncPlanGate {
  return {
    planKey: plan.planKey,
    suiteFilter: plan.suiteNameFilter.trim().length > 0,
    maxSuites: plan.maxSuites > 0,
    loaded,
  };
}

export function syncPlanGatesAfterLoad(cfg: SyncConfig, loadedPlanKeys: string[]): SyncPlanGate[] {
  return cfg.plans.map((plan) => ({
    ...syncPlanGateFromConfig(plan, false),
    loaded: loadedPlanKeys.some((key) => planKeyMatch(key, plan.planKey)),
  }));
}

/**
 * Lote íntegro substitui o snapshot. Filtro, MaxSuites, plano ausente ou coleta parcial não publicam.
 */
export function ensureSyncPublishable(plans: SyncPlanGate[], partial: boolean): void {
  const errors: string[] = [];
  if (partial) {
    errors.push("A coleta não terminou. A sincronização foi cancelada para não apagar os dados atuais.");
  }
  for (const plan of plans) {
    const key = plan.planKey.trim() || "?";
    if (plan.suiteFilter) {
      errors.push(
        `O plano ${key} tem filtro de suíte. A sincronização foi cancelada para não apagar dados fora do filtro.`,
      );
    }
    if (plan.maxSuites) {
      errors.push(
        `O plano ${key} tem MaxSuites. A sincronização foi cancelada para não apagar as suítes omitidas.`,
      );
    }
    if (!plan.loaded) {
      errors.push(`O plano ${key} não entrou na coleta. A sincronização foi cancelada para não apagar os dados atuais.`);
    }
  }
  if (errors.length > 0) throw new SyncValidationError([...new Set(errors)]);
}
