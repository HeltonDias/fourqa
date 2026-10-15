import type { KpiImpactos } from "../azure/kpis.js";
import { query, withTransaction } from "../db/postgres/pool.js";

/** Sem batimento novo, outra instância pode assumir o job. Cobre a morte da Function. */
export const SYNC_HEARTBEAT_STALE_MS = 90_000;
export const SYNC_JOB_KEY = "sync_job";

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

type StoredSyncJob = SyncState & { beatAt: string | null };

const UPSERT = `INSERT INTO workbook_meta (key, value) VALUES ($1, $2)
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;

export function isDurableSyncRuntime(): boolean {
  return process.env.VERCEL === "1";
}

export function emptySyncState(): SyncState {
  return {
    status: "idle",
    startedAt: null,
    finishedAt: null,
    step: "",
    progress: null,
    summary: null,
    error: null,
  };
}

function emptyStored(): StoredSyncJob {
  return { ...emptySyncState(), beatAt: null };
}

function progressOf(value: unknown): SyncState["progress"] {
  if (!value || typeof value !== "object") return null;
  const row = value as { done?: unknown; total?: unknown };
  if (typeof row.done !== "number" || typeof row.total !== "number") return null;
  return { done: row.done, total: row.total };
}

export function parseSyncJob(raw: string | null): StoredSyncJob {
  if (!raw) return emptyStored();
  try {
    const value = JSON.parse(raw) as Partial<StoredSyncJob>;
    if (!value || typeof value.status !== "string") return emptyStored();
    if (value.status !== "idle" && value.status !== "running" && value.status !== "success" && value.status !== "error") {
      return emptyStored();
    }
    return {
      status: value.status,
      startedAt: typeof value.startedAt === "string" ? value.startedAt : null,
      finishedAt: typeof value.finishedAt === "string" ? value.finishedAt : null,
      step: typeof value.step === "string" ? value.step : "",
      progress: progressOf(value.progress),
      summary: value.summary ?? null,
      error: typeof value.error === "string" ? value.error : null,
      beatAt: typeof value.beatAt === "string" ? value.beatAt : null,
    };
  } catch {
    return emptyStored();
  }
}

/** Job running sem batimento recente vira erro visível. A linha no banco só muda num novo claim. */
export function visibleSyncJob(job: StoredSyncJob, nowMs: number, staleMs: number): SyncState {
  const { beatAt: _beat, ...state } = job;
  if (job.status !== "running") return state;
  const beat = Date.parse(job.beatAt ?? job.startedAt ?? "");
  if (Number.isFinite(beat) && nowMs - beat < staleMs) return state;
  return {
    ...state,
    status: "error",
    finishedAt: new Date(nowMs).toISOString(),
    progress: null,
    error: "Sincronização interrompida antes de concluir. Os dados anteriores permanecem. Tente novamente.",
  };
}

export function runningSyncJob(now: Date): StoredSyncJob {
  const at = now.toISOString();
  return {
    ...emptySyncState(),
    status: "running",
    startedAt: at,
    step: "Iniciando",
    beatAt: at,
  };
}

export async function saveSyncJob(job: StoredSyncJob): Promise<void> {
  await query(UPSERT, [SYNC_JOB_KEY, JSON.stringify(job)]);
}

export async function readSyncJob(nowMs = Date.now(), staleMs = SYNC_HEARTBEAT_STALE_MS): Promise<SyncState> {
  const rows = await query<{ value: string | null }>("SELECT value FROM workbook_meta WHERE key = $1", [SYNC_JOB_KEY]);
  return visibleSyncJob(parseSyncJob(rows[0]?.value ?? null), nowMs, staleMs);
}

/**
 * Uma transação curta decide o job. Não segura conexão durante o fetch do Azure,
 * então funciona no transaction pooler.
 */
export async function claimSyncJob(
  now: Date,
  staleMs = SYNC_HEARTBEAT_STALE_MS,
): Promise<{ started: boolean; state: SyncState }> {
  return withTransaction(async (client) => {
    await client.query(`INSERT INTO workbook_meta (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING`, [
      SYNC_JOB_KEY,
      JSON.stringify(emptyStored()),
    ]);
    const found = await client.query<{ value: string | null }>(
      `SELECT value FROM workbook_meta WHERE key = $1 FOR UPDATE`,
      [SYNC_JOB_KEY],
    );
    const current = parseSyncJob(found.rows[0]?.value ?? null);
    const visible = visibleSyncJob(current, now.getTime(), staleMs);
    if (visible.status === "running") return { started: false, state: visible };
    const next = runningSyncJob(now);
    await client.query(UPSERT, [SYNC_JOB_KEY, JSON.stringify(next)]);
    return { started: true, state: visibleSyncJob(next, now.getTime(), staleMs) };
  });
}
