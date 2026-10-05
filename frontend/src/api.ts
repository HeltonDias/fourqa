const PLAN_KEY = "EndToEnd";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

export type HomeDto = import("./types").HomeDto;
export type PlanejamentoDto = import("./types").PlanejamentoDto;
export type StatusFrenteDto = import("./types").StatusFrenteDto;

export const api = {
  health: () => get<{ ok: boolean; ready: boolean }>("/api/health"),
  home: () => get<HomeDto>(`/api/home?planKey=${PLAN_KEY}`),
  planejamento: () => get<PlanejamentoDto>(`/api/planejamento?planKey=${PLAN_KEY}`),
  statusFrente: () => get<StatusFrenteDto>(`/api/status-frente?planKey=${PLAN_KEY}`),
  execucoes: (limit = 500) =>
    get<{ total: number; rows: import("./types").ExecucaoRow[] }>(
      `/api/execucoes?planKey=${PLAN_KEY}&limit=${limit}`,
    ),
  falhas: (limit = 500) =>
    get<{ total: number; rows: import("./types").FalhaRow[] }>(
      `/api/falhas?planKey=${PLAN_KEY}&limit=${limit}`,
    ),
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

export function fmtDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
    return iso.slice(0, 10);
  }
  return d.toLocaleDateString("pt-BR");
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
