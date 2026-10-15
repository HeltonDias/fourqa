async function get<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("fourqa_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function post<T>(path: string): Promise<T> {
  const res = await fetch(path, { method: "POST", headers: authHeaders() });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? res.statusText);
  return body as T;
}

async function postJson<T>(path: string, data: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(data),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? res.statusText);
  return body as T;
}

async function put<T>(path: string, data: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(data),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? res.statusText);
  return body as T;
}

export type SyncState = import("./types").SyncState;
export type HomeDto = import("./types").HomeDto;
export type PlanningView = import("./types").PlanningView;
export type StatusFrenteDto = import("./types").StatusFrenteDto;

export type Page<T> = { total: number; limit: number; offset: number; rows: T[] };

function pageQuery(params: { limit?: number; offset?: number; q?: string }): string {
  const q = new URLSearchParams();
  if (params.limit != null) q.set("limit", String(params.limit));
  if (params.offset != null) q.set("offset", String(params.offset));
  if (params.q) q.set("q", params.q);
  const s = q.toString();
  return s ? `?${s}` : "";
}

export const api = {
  health: () => get<{ ok: boolean; database: string }>("/api/health"),
  home: () => get<HomeDto>("/api/home"),
  startSync: () => post<{ started: boolean; state: SyncState }>("/api/sync"),
  syncStatus: () => get<SyncState>("/api/sync/status"),
  salvarCabecalho: (title: string, subtitle: string) =>
    put<{ title: string; subtitle: string }>("/api/cabecalho", { title, subtitle }),
  salvarPeriodoPlano: (inicio: string, fim: string) =>
    put<HomeDto["periodo"]>("/api/periodo", { inicio, fim }),
  planejamento: (version?: number) =>
    get<PlanningView>(`/api/planejamento${version != null ? `?version=${version}` : ""}`),
  confirmarPlanejamento: (body: { reason: string; adoptSource: boolean }) =>
    postJson<PlanningView>("/api/planejamento/revisao", body),
  salvarCelulaPlanejamento: (body: {
    suiteId: number | null;
    testPointId?: number | null;
    field: "start" | "end" | "day" | "responsavel" | "prioridade";
    date?: string;
    quantity?: number;
    value?: string;
  }) => put<PlanningView>("/api/planejamento/celula", body),
  statusFrente: () => get<StatusFrenteDto>("/api/status-frente"),
  execucoes: (params: { limit?: number; offset?: number; q?: string } = {}) =>
    get<Page<import("./types").ExecucaoRow>>(`/api/execucoes${pageQuery(params)}`),
  falhas: (params: { limit?: number; offset?: number; q?: string } = {}) =>
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
