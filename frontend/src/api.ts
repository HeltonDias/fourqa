export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function isConflict(err: unknown): err is ApiError {
  return err instanceof ApiError && err.status === 409;
}

export type DistributionPreview = {
  preview: true;
  mode: "completo" | "saldo";
  cut: string | null;
  suiteCount: number;
  finalized: number;
  pending: number;
  unchanged: boolean;
  days: { date: string; quantity: number }[];
};

export type ClearPlanningPreview = {
  preview: true;
  action: "limpar";
  suiteCount: number;
  finalized: number;
  kept: number;
  removed: number;
  unchanged: boolean;
};

function apiMessage(body: { error?: string; detail?: unknown }, fallback: string): string {
  if (typeof body.error === "string" && body.error) return body.error;
  if (typeof body.detail === "string" && body.detail) return body.detail;
  if (body.detail && typeof body.detail === "object" && "error" in body.detail) {
    const nested = (body.detail as { error?: unknown }).error;
    if (typeof nested === "string" && nested) return nested;
  }
  return fallback;
}

async function fail(res: Response): Promise<never> {
  const body = (await res.json().catch(() => ({}))) as { error?: string; detail?: unknown };
  throw new ApiError(res.status, apiMessage(body, res.statusText));
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: authHeaders() });
  if (!res.ok) await fail(res);
  return res.json() as Promise<T>;
}

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("fourqa_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function post<T>(path: string): Promise<T> {
  const res = await fetch(path, { method: "POST", headers: authHeaders() });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, apiMessage(body, res.statusText));
  return body as T;
}

async function postJson<T>(path: string, data: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(data),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, apiMessage(body, res.statusText));
  return body as T;
}

async function put<T>(path: string, data: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(data),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, apiMessage(body, res.statusText));
  return body as T;
}

export type SyncState = import("./types").SyncState;
export type HomeDto = import("./types").HomeDto;
export type PlanningView = import("./types").PlanningView;
export type StatusFrenteDto = import("./types").StatusFrenteDto;

export type Page<T> = { total: number; limit: number; offset: number; rows: T[] };

export type SyncSettingsView = {
  organization: string;
  project: string;
  apiVersion: string;
  credentialConfigured: boolean;
  plans: {
    planKey: string;
    planId: number;
    planName: string;
    suiteNameFilter: string;
    maxSuites: number;
    load: boolean;
  }[];
  hierarchy: {
    planKey: string;
    order: number;
    columnName: string;
    sourceLevel: string;
    source: string;
    active: boolean;
  }[];
  responsibilities: { category: string; responsibility: string }[];
  clearBefore: string;
  createHeader: string;
  executionFields: string[];
  failureFields: string[];
  kpiPlanKey: string;
  warning: string | null;
  source: "saved" | "environment";
  executionCatalog: string[];
  failureCatalog: string[];
};

function planQuery(planKey?: string, extra?: Record<string, string | undefined>): string {
  const q = new URLSearchParams();
  const key = planKey?.trim();
  if (key) q.set("planKey", key);
  if (extra) {
    for (const [name, value] of Object.entries(extra)) {
      if (value) q.set(name, value);
    }
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

function pageQuery(params: { limit?: number; offset?: number; q?: string; planKey?: string }): string {
  const q = new URLSearchParams();
  const key = params.planKey?.trim();
  if (key) q.set("planKey", key);
  if (params.limit != null) q.set("limit", String(params.limit));
  if (params.offset != null) q.set("offset", String(params.offset));
  if (params.q) q.set("q", params.q);
  const s = q.toString();
  return s ? `?${s}` : "";
}

export const api = {
  health: () => get<{ ok: boolean; database: string }>("/api/health"),
  home: (planKey?: string) => get<HomeDto>(`/api/home${planQuery(planKey)}`),
  startSync: () => post<{ started: boolean; state: SyncState }>("/api/sync"),
  syncStatus: () => get<SyncState>("/api/sync/status"),
  syncSettings: () => get<SyncSettingsView>("/api/sync/config"),
  salvarParametros: (body: {
    kpiPlanKey: string;
    hierarchy: SyncSettingsView["hierarchy"];
    responsibilities: SyncSettingsView["responsibilities"];
    executionFields: string[];
    failureFields: string[];
  }) => put<SyncSettingsView>("/api/sync/config", body),
  restaurarParametros: () => put<SyncSettingsView>("/api/sync/config", { reset: true }),
  salvarCabecalho: (title: string, subtitle: string, base?: { title: string; subtitle: string }) =>
    put<{ title: string; subtitle: string }>("/api/cabecalho", {
      title,
      subtitle,
      ...(base ? { baseTitle: base.title, baseSubtitle: base.subtitle } : {}),
    }),
  salvarPeriodoPlano: (inicio: string, fim: string, base?: { inicio: string; fim: string }) =>
    put<HomeDto["periodo"]>("/api/periodo", {
      inicio,
      fim,
      ...(base ? { baseInicio: base.inicio, baseFim: base.fim } : {}),
    }),
  planejamento: (version?: number, planKey?: string) =>
    get<PlanningView>(`/api/planejamento${planQuery(planKey, version != null ? { version: String(version) } : undefined)}`),
  confirmarPlanejamento: (body: { reason: string; adoptSource: boolean }, planKey?: string) =>
    postJson<PlanningView>(`/api/planejamento/revisao${planQuery(planKey)}`, body),
  planejamentoAlteracoes: (planKey?: string) =>
    get<import("./types").PlanningChangeLogResponse>(`/api/planejamento/alteracoes${planQuery(planKey)}`),
  salvarCelulaPlanejamento: (
    body: {
      suiteId: number | null;
      testPointId?: number | null;
      field: "start" | "end" | "day" | "responsavel" | "prioridade";
      date?: string;
      quantity?: number;
      value?: string;
      baseDate?: string | null;
      baseQuantity?: number;
      baseValue?: string | null;
    },
    planKey?: string,
  ) => put<PlanningView>(`/api/planejamento/celula${planQuery(planKey)}`, body),
  salvarLotePlanejamento: (
    body: {
      changes: {
        suiteId: number | null;
        testPointId?: number | null;
        field: "start" | "end" | "day";
        date: string;
        quantity?: number;
        baseDate?: string | null;
        baseQuantity?: number;
      }[];
    },
    planKey?: string,
  ) => put<PlanningView>(`/api/planejamento/lote${planQuery(planKey)}`, body),
  distribuirPlanejamento: (
    body: {
      strategy: "montanha" | "decrescente" | "crescente" | "uniforme";
      start: string;
      end: string;
      resguardo: number;
      enabledWeekendDays: string[];
      replace: boolean;
      assignment?: "manter";
      mode?: "completo" | "saldo";
      cut?: string;
      preview?: boolean;
    },
    planKey?: string,
  ) => put<PlanningView | DistributionPreview>(`/api/planejamento/distribuir${planQuery(planKey)}`, body),
  limparPlanejamento: (body: { preview?: boolean }, planKey?: string) =>
    put<PlanningView | ClearPlanningPreview>(`/api/planejamento/limpar${planQuery(planKey)}`, body),
  statusFrente: (planKey?: string) => get<StatusFrenteDto>(`/api/status-frente${planQuery(planKey)}`),
  execucoes: (params: { limit?: number; offset?: number; q?: string; planKey?: string } = {}) =>
    get<Page<import("./types").ExecucaoRow>>(`/api/execucoes${pageQuery(params)}`),
  falhas: (params: { limit?: number; offset?: number; q?: string; planKey?: string } = {}) =>
    get<Page<import("./types").FalhaRow>>(`/api/falhas${pageQuery(params)}`),
};

export function pct(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

/** Formato da planilha: 0,00% */
export function fmtPctBr(n: number, decimals = 2): string {
  if (!Number.isFinite(n)) return "—";
  const v = (n * 100).toFixed(decimals).replace(".", ",");
  return `${v}%`;
}

function parseDateIso(iso: string): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (!Number.isNaN(d.getTime())) return d;
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return null;
}

export function fmtDate(iso: string): string {
  const d = parseDateIso(iso);
  if (!d) return iso ? iso.slice(0, 10) : "—";
  return d.toLocaleDateString("pt-BR");
}

/** Data compacta para tabelas: dd/MM/yy */
export function fmtDateShort(iso: string): string {
  const d = parseDateIso(iso);
  if (!d) return "—";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear() % 100).padStart(2, "0");
  return `${dd}/${mm}/${yy}`;
}

export function fmtDateTime(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
