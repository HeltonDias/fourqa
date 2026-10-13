import type { ExecucaoRow, FalhaRow } from "../types.js";
import type {
  AzureSnapshot,
  PageParams,
  PageResult,
} from "../db/sqliteAzureSnapshotStore.js";
import type { LegacyPlanRow } from "../db/sqliteLegacyPlanStore.js";
import type {
  CommitRevisionInput,
  PlanningCellWrite,
  PlanningRevisionRecord,
  PlanningScheduleItem,
  PlanningScopeWrite,
  PlanningItemWrite,
} from "../db/sqlitePlanningStore.js";

export type { PlanningItemWrite, LegacyPlanRow };

/** SQLite devolve o valor na hora. PostgreSQL devolve Promise. Quem chama precisa usar await. */
export type MaybePromise<T> = T | Promise<T>;

export interface MetaStore {
  get(key: string): MaybePromise<string | null>;
  set(key: string, value: string): MaybePromise<void>;
}

export interface AzureSnapshotStore {
  replaceSnapshot(input: AzureSnapshot): MaybePromise<void>;
  listExecucoes(planKey: string): MaybePromise<ExecucaoRow[]>;
  listFalhas(planKey: string): MaybePromise<FalhaRow[]>;
  queryExecucoes(params: PageParams): MaybePromise<PageResult<ExecucaoRow>>;
  queryFalhas(params: PageParams): MaybePromise<PageResult<FalhaRow>>;
}

export interface LegacyPlanStore {
  listBase(): MaybePromise<LegacyPlanRow[]>;
}

export interface PlanningStore {
  latestRevision(planKey: string): MaybePromise<PlanningRevisionRecord | null>;
  revisionByVersion(planKey: string, version: number): MaybePromise<PlanningRevisionRecord | null>;
  listRevisions(planKey: string): MaybePromise<{ version: number; createdAt: string; reason: string }[]>;
  loadScope(revisionId: number): MaybePromise<PlanningScopeWrite[]>;
  loadSchedule(revisionId: number): MaybePromise<PlanningScheduleItem[]>;
  commitRevision(input: CommitRevisionInput): MaybePromise<number>;
  saveCell(input: PlanningCellWrite): MaybePromise<void>;
}

export interface PersistenceStores {
  meta: MetaStore;
  azureSnapshot: AzureSnapshotStore;
  legacyPlan: LegacyPlanStore;
  planning: PlanningStore;
}
