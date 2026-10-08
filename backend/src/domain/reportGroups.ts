import type { DetectedDimension } from "./dimensions.js";
import type { ExecucaoRow } from "../types.js";

export type ReportExecGroup = {
  rows: ExecucaoRow[];
  classificacao: Record<string, string>;
  frente: string | null;
  processo: string;
};

const SUITE_FALLBACK = "(sem suíte)";

function visibleDimensions(dimensoes: DetectedDimension[]): DetectedDimension[] {
  return dimensoes.filter((dim) => dim.visible !== false);
}

function parseDimensions(row: ExecucaoRow): Record<string, string> {
  if (!row.dimensions_json) return {};
  try {
    const parsed = JSON.parse(row.dimensions_json) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "string" && value.trim()) out[key] = value.trim();
    }
    return out;
  } catch {
    return {};
  }
}

function dimensionValue(row: ExecucaoRow, dim: DetectedDimension, parsed: Record<string, string>): string {
  const fromJson = parsed[dim.key]?.trim() ?? "";
  if (fromJson) return fromJson;
  if (dim.role === "front") return (row.frente ?? "").trim();
  if (dim.role === "process") return (row.processo ?? row.suite_name ?? "").trim();
  return "";
}

/**
 * Com papel process, cada combinação distinta das dimensões visíveis vira uma linha.
 * Sem process, a linha continua sendo a suíte, como no plano legado.
 * Cada execução entra em um único grupo.
 */
export function groupExecucoesForReport(execRows: ExecucaoRow[], dimensoes: DetectedDimension[]): ReportExecGroup[] {
  const visible = visibleDimensions(dimensoes);
  const processDim = visible.find((dim) => dim.role === "process");
  const frontDim = visible.find((dim) => dim.role === "front");
  const groups = new Map<string, ReportExecGroup>();

  for (const row of execRows) {
    const parsed = parseDimensions(row);
    if (!processDim) {
      const processo = (row.suite_name ?? "").trim() || SUITE_FALLBACK;
      const key = `suite:${processo.toLowerCase()}`;
      const found = groups.get(key);
      if (found) {
        found.rows.push(row);
        continue;
      }
      let classificacao = parsed;
      if (Object.keys(classificacao).length === 0 && visible[0] && (row.frente ?? "").trim()) {
        classificacao = { [visible[0].key]: row.frente!.trim() };
      }
      groups.set(key, {
        rows: [row],
        classificacao,
        frente: row.frente,
        processo,
      });
      continue;
    }

    const classificacao: Record<string, string> = {};
    const parts: string[] = [];
    for (const dim of visible) {
      const value = dimensionValue(row, dim, parsed);
      if (value) classificacao[dim.key] = value;
      parts.push(`${dim.key}=${value}`);
    }
    const key = parts.join("\u001f");
    const found = groups.get(key);
    if (found) {
      found.rows.push(row);
      continue;
    }
    const processo = classificacao[processDim.key] || (row.suite_name ?? "").trim() || SUITE_FALLBACK;
    const frontValue = frontDim ? classificacao[frontDim.key] : undefined;
    groups.set(key, {
      rows: [row],
      classificacao,
      frente: frontValue || row.frente || null,
      processo,
    });
  }

  return [...groups.values()];
}
