import { fmtPctBr } from "../../api";
import type { FaceStatus } from "../StatusFace";
import type { StatusFrenteBloco, StatusFrenteDto } from "../../types";

/**
 * Catálogo visual dos KPIs da frente.
 * Valores vêm de /api/status-frente, com a mesma conta da Home:
 * % plan e % real sobre o total; gap = planejado até hoje − finalizados;
 * % bugs DEV/cliente = falhas daquele responsável ÷ CTs executados (passed + falha + bloqueado).
 * Replanejamento por frente fica de fora: existe na linha de planejamento, ainda sem agregação neste contrato.
 * outrosUat permanece no payload e não entra no painel: depende do plano UAT.
 */
export type FrenteKpi = {
  id: string;
  label: string;
  hint: string;
  text: string;
  tone?: "gap-late" | "gap-ahead" | "gap-even";
};

const RANK: Record<FaceStatus, number> = { risk: 0, warn: 1, ok: 2, done: 3, na: 4 };

export function fmtInt(n: number): string {
  return Math.round(n).toLocaleString("pt-BR");
}

export function fmtGap(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  const text = rounded.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  return rounded > 0 ? `+${text}` : text;
}

function gapTone(n: number): FrenteKpi["tone"] {
  if (n > 0) return "gap-late";
  if (n < 0) return "gap-ahead";
  return "gap-even";
}

export function kpisDaFrente(bloco: Pick<StatusFrenteBloco, "cenarios" | "indicadores">): FrenteKpi[] {
  const { cenarios, indicadores } = bloco;
  return [
    { id: "pctPlan", label: "% plan", hint: "Planejado até hoje sobre o total da frente", text: fmtPctBr(indicadores.pctPlan, 1) },
    { id: "pctReal", label: "% real", hint: "Finalizados sobre o total da frente", text: fmtPctBr(indicadores.pctReal, 1) },
    { id: "gap", label: "Gap", hint: "Planejado até hoje menos finalizados", text: fmtGap(indicadores.gap), tone: gapTone(indicadores.gap) },
    { id: "ttl", label: "Itens", hint: "Test points da frente", text: fmtInt(cenarios.ttl) },
    { id: "fin", label: "Finalizados", hint: "Passed, N/A e cancelados", text: fmtInt(cenarios.finalizado) },
    { id: "falha", label: "Falhas", hint: "Test points com falha", text: fmtInt(cenarios.falha) },
    { id: "bloqueado", label: "Bloqueados", hint: "Test points bloqueados", text: fmtInt(cenarios.bloqueado) },
    { id: "abertos", label: "Bugs abertos", hint: "Bugs ainda não fechados", text: fmtInt(indicadores.bugsAbertos) },
    { id: "dev", label: "% bugs DEV", hint: "Falhas de Desenvolvimento sobre os CTs executados", text: fmtPctBr(indicadores.pctBugsDev, 1) },
    { id: "cliente", label: "% bugs cliente", hint: "Falhas de Cliente sobre os CTs executados", text: fmtPctBr(indicadores.pctBugsCliente, 1) },
  ];
}

export function ordenarFrentes(blocos: StatusFrenteBloco[], busca: string): StatusFrenteBloco[] {
  const q = busca.trim().toLowerCase();
  return blocos
    .filter((bloco) => bloco.frente.toLowerCase().includes(q))
    .sort((a, b) => {
      const rank = RANK[a.indicadores.status] - RANK[b.indicadores.status];
      if (rank !== 0) return rank;
      return a.frente.localeCompare(b.frente, "pt-BR");
    });
}

export function contagemPorStatus(dto: StatusFrenteDto): { status: FaceStatus; total: number }[] {
  const ordem: FaceStatus[] = ["risk", "warn", "ok", "done", "na"];
  return ordem
    .map((status) => ({
      status,
      total: dto.blocos.filter((bloco) => bloco.indicadores.status === status).length,
    }))
    .filter((item) => item.total > 0);
}
