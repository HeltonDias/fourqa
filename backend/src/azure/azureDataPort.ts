import type { DetectedDimension } from "../domain/dimensions.js";
import type { ExecucaoInsert } from "./execucoes.js";
import type { FalhaInsert } from "./falhas.js";
import type { KpiImpactos } from "./kpis.js";

/** Vazio: nunca carregado com sucesso. Carregado: último refresh ok. Desatualizado: refresh falhou, servindo o lote anterior. */
export type AzurePlanCacheState = "empty" | "loaded" | "stale";

export interface AzurePlanSnapshot {
  planKey: string;
  state: AzurePlanCacheState;
  execucoes: ExecucaoInsert[];
  falhas: FalhaInsert[];
  dimensions: DetectedDimension[];
  /** Preenchido só no plano KPI configurado. */
  kpi: KpiImpactos | null;
  fetchedAt: string | null;
}

export interface AzureRefreshMeta {
  fetchedAt: string | null;
  /** true quando o último refresh falhou e ainda há dados do refresh anterior. */
  stale: boolean;
  kpiPlanKey: string | null;
}

/** Metadados derivados do refresh, para integração futura com workbook_meta (não gravados nesta fase). */
export interface AzureRefreshArtifacts {
  fetchedAt: string;
  dimensoesMeta: Record<string, string>;
  workbookMeta: Record<string, string>;
  summary: {
    execucoes: number;
    falhas: number;
    suites: number;
    runs: number;
    kpi: KpiImpactos | null;
  };
}

export interface AzureDataPort {
  getPlan(planKey: string): AzurePlanSnapshot;
  listLoadedPlanKeys(): string[];
  getRefreshMeta(): AzureRefreshMeta;
}
