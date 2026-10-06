import type { ExecucaoRow, GraficoPontoDiaDetalhado, PlanningProgressSnapshot } from "../types.js";
import { assertStoredPlanningPeriod, parseCalendarDay } from "./planPeriod.js";
import { businessDays } from "./graficos.js";
import { statusCenario } from "./formulas.js";

function toDateOnly(v: string | null | undefined): Date | null {
  if (!v) return null;
  const s = String(v).trim();
  const head = s.match(/^(\d{4}-\d{2}-\d{2})/)?.[0] ?? s;
  const cal = parseCalendarDay(head);
  if (!cal) return null;
  const [y, m, d] = cal.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000);
}

function isRealizado(e: ExecucaoRow, planKey: string): boolean {
  if ((e.plan_key ?? "").trim() !== planKey) return false;
  const s = statusCenario(e);
  return s === "passed" || s === "na";
}

export function sumAllocationsByDay(allocations: Iterable<Record<string, number>>): Map<string, number> {
  const planPorDia = new Map<string, number>();
  for (const map of allocations) {
    for (const [day, qty] of Object.entries(map)) {
      const head = day.match(/^(\d{4}-\d{2}-\d{2})/)?.[0] ?? day;
      const k = parseCalendarDay(head) ?? head;
      const n = Number(qty) || 0;
      if (n === 0) continue;
      planPorDia.set(k, (planPorDia.get(k) ?? 0) + n);
    }
  }
  return planPorDia;
}

export function situacaoProgresso(
  planejado: number,
  realizado: number,
): PlanningProgressSnapshot["situacao"] {
  if (realizado > planejado) return "adiantado";
  if (realizado < planejado) return "atrasado";
  return "dentro";
}

/**
 * Planejado diário = soma das `planning_allocation` (aba Planejar).
 * Realizado diário = execuções finalizadas (Passed/N/A) por DateCompleted (fallback LastUpdatedDate).
 * Eixo = dias úteis do período planejado; acumulados progressivos.
 */
export function planejadoVsRealizadoFromAllocations(
  planPorDiaInput: Map<string, number>,
  execRows: ExecucaoRow[],
  planKey: string,
  periodo: { inicio: string; fim: string },
  hoje: Date = new Date(),
): GraficoPontoDiaDetalhado[] {
  assertStoredPlanningPeriod(periodo.inicio, periodo.fim);
  const inicio = toDateOnly(periodo.inicio);
  const fim = toDateOnly(periodo.fim);
  if (!inicio || !fim || fim.getTime() < inicio.getTime()) return [];

  const eixo = businessDays(inicio, fim);
  if (eixo.length === 0) return [];

  const planPorDia = new Map<string, number>(eixo.map((d) => [isoDay(d), 0]));
  for (const [day, qty] of planPorDiaInput) {
    if (planPorDia.has(day)) planPorDia.set(day, (planPorDia.get(day) ?? 0) + qty);
  }

  const realPorDia = new Map<string, number>();
  for (const e of execRows) {
    if (!isRealizado(e, planKey)) continue;
    const d = toDateOnly(e.date_completed) ?? toDateOnly(e.last_updated_date);
    if (!d) continue;
    const k = isoDay(d);
    realPorDia.set(k, (realPorDia.get(k) ?? 0) + 1);
  }

  const primeiro = isoDay(eixo[0]);
  let realAntes = 0;
  for (const [k, v] of realPorDia) if (k < primeiro) realAntes += v;

  const hojeKey = isoDay(new Date(Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())));

  let accPlan = 0;
  let accReal = realAntes;
  const pontos: GraficoPontoDiaDetalhado[] = [];
  let cursor = eixo[0];

  for (const d of eixo) {
    const k = isoDay(d);
    const planejadoDia = planPorDia.get(k) ?? 0;
    accPlan += planejadoDia;

    let realizadoDia = 0;
    for (let x = cursor; x.getTime() <= d.getTime(); x = addDays(x, 1)) {
      realizadoDia += realPorDia.get(isoDay(x)) ?? 0;
    }
    accReal += realizadoDia;
    cursor = addDays(d, 1);

    pontos.push({
      data: k,
      planejadoDia,
      realizadoDia,
      planejado: Math.round(accPlan * 10) / 10,
      realizado: k <= hojeKey ? accReal : null,
    });
  }
  return pontos;
}

export function snapshotProgresso(
  serie: GraficoPontoDiaDetalhado[],
  hoje: Date = new Date(),
): PlanningProgressSnapshot | null {
  if (serie.length === 0) return null;
  const hojeKey = isoDay(new Date(Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())));
  let ponto = serie[0];
  for (const row of serie) {
    if (row.data <= hojeKey) ponto = row;
    else break;
  }
  const planejadoAteHoje = Math.round(ponto.planejado);
  const realizadoAteHoje = ponto.realizado ?? 0;
  const diferenca = realizadoAteHoje - planejadoAteHoje;
  return {
    serie,
    planejadoAteHoje,
    realizadoAteHoje,
    diferenca,
    situacao: situacaoProgresso(planejadoAteHoje, realizadoAteHoje),
  };
}
