import type {
  AzureDataPort,
  AzurePlanCacheState,
  AzurePlanSnapshot,
  AzureRefreshArtifacts,
  AzureRefreshMeta,
} from "./azureDataPort.js";
import type { AzureRefreshDraft } from "./azureDataRefresh.js";
import { planKeyMatch } from "./planKeyMatch.js";

type StoredPlan = {
  state: AzurePlanCacheState;
  execucoes: AzurePlanSnapshot["execucoes"];
  falhas: AzurePlanSnapshot["falhas"];
  dimensions: AzurePlanSnapshot["dimensions"];
  kpi: AzurePlanSnapshot["kpi"];
  fetchedAt: string;
};

const emptySnapshot = (planKey: string): AzurePlanSnapshot => ({
  planKey,
  state: "empty",
  execucoes: [],
  falhas: [],
  dimensions: [],
  kpi: null,
  fetchedAt: null,
});

export class InMemoryAzureCache implements AzureDataPort {
  private plans = new Map<string, StoredPlan>();
  private fetchedAt: string | null = null;
  private stale = false;
  private kpiPlanKey: string | null = null;
  private refreshing = false;
  private publishing = false;
  private generationMeta: Record<string, string> | null = null;

  /** Chave armazenada, com correspondência exata e depois sem caixa. */
  findPlanKey(planKey: string): string | null {
    const trimmed = planKey.trim();
    if (!trimmed) return null;
    if (this.plans.has(trimmed)) return trimmed;
    const hits = [...this.plans.keys()].filter((key) => planKeyMatch(key, trimmed));
    if (hits.length > 1) throw new Error("PlanKey ambíguo no cache");
    return hits[0] ?? null;
  }

  getPlan(planKey: string): AzurePlanSnapshot {
    const key = this.findPlanKey(planKey);
    if (!key) return emptySnapshot(planKey.trim());
    const row = this.plans.get(key);
    if (!row) return emptySnapshot(key);
    return clonePublicPlan(key, row);
  }

  listLoadedPlanKeys(): string[] {
    return [...this.plans.keys()].sort();
  }

  getRefreshMeta(): AzureRefreshMeta {
    return { fetchedAt: this.fetchedAt, stale: this.stale, kpiPlanKey: this.kpiPlanKey };
  }

  /** Troca o mapa inteiro só após um refresh bem-sucedido. */
  commitSuccessfulRefresh(draft: AzureRefreshDraft, artifacts: AzureRefreshArtifacts): void {
    const next = new Map<string, StoredPlan>();
    const at = artifacts.fetchedAt;
    for (const plan of draft.plans) {
      next.set(plan.planKey, {
        state: "loaded",
        execucoes: plan.execucoes.map((row) => ({ ...row })),
        falhas: plan.falhas.map((row) => ({ ...row })),
        dimensions: plan.dimensions.map((row) => ({ ...row })),
        kpi: plan.kpi ? { ...plan.kpi } : null,
        fetchedAt: at,
      });
    }
    this.plans = next;
    this.fetchedAt = at;
    this.stale = false;
    this.kpiPlanKey = draft.kpiPlanKey;
    this.generationMeta = { ...artifacts.workbookMeta };
  }

  /** Há uma geração publicada. Stale e publicação em curso continuam servindo esse lote. */
  hasPublishedGeneration(): boolean {
    return this.generationMeta !== null;
  }

  /**
   * Metadados da última geração publicada.
   * Null só quando nunca houve commit. Falha e publicação não apagam o lote.
   */
  readGeneration(): { meta: Record<string, string> } | null {
    if (!this.generationMeta) return null;
    return { meta: { ...this.generationMeta } };
  }

  /** Mantém o lote anterior e marca como desatualizado. */
  markRefreshFailed(): void {
    if (this.plans.size === 0) return;
    this.stale = true;
    const at = this.fetchedAt;
    for (const [key, row] of this.plans) {
      if (row.state === "loaded") {
        this.plans.set(key, { ...row, state: "stale" });
      }
    }
    this.fetchedAt = at;
  }

  beginRefresh(): void {
    if (this.refreshing) throw new Error("Refresh Azure já em andamento.");
    this.refreshing = true;
  }

  endRefresh(): void {
    this.refreshing = false;
  }

  isRefreshing(): boolean {
    return this.refreshing;
  }

  /** Enquanto o banco está sendo trocado, a leitura não usa o lote anterior. */
  beginPublish(): void {
    this.publishing = true;
  }

  endPublish(): void {
    this.publishing = false;
  }
}

/** Instância isolada para integração futura; não ligada às rotas nesta fase. */
let shared: InMemoryAzureCache | null = null;

export function getInMemoryAzureCache(): InMemoryAzureCache {
  if (!shared) shared = new InMemoryAzureCache();
  return shared;
}

/** Só para testes. */
export function resetInMemoryAzureCache(): void {
  shared = null;
}

function clonePublicPlan(planKey: string, row: StoredPlan): AzurePlanSnapshot {
  return {
    planKey,
    state: row.state,
    execucoes: row.execucoes.map((item) => ({ ...item })),
    falhas: row.falhas.map((item) => ({ ...item })),
    dimensions: row.dimensions.map((item) => ({ ...item })),
    kpi: row.kpi ? { ...row.kpi } : null,
    fetchedAt: row.fetchedAt,
  };
}
