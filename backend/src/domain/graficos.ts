import type {
  ExecucaoRow,
  GraficoFatia,
  GraficoPontoDia,
  PlanejamentoLinha,
} from "../types.js";
import { statusCenario } from "./formulas.js";

/**
 * Releitura dos gráficos da aba Home da planilha:
 *  - "Planejado Vs Realizado": linhas acumuladas por dia útil.
 *  - "Status das Execuções": pizza com os totais por outcome.
 *
 * Planejado segue o calendário da aba Planejamento: cada suite distribui
 * QTD CTS PLAN igualmente pelos dias úteis entre Data início e Data fim
 * (CTS PLAN DIA), pulando sábado/domingo. Realizado conta execuções
 * finalizadas (Passed ou N/A) pela DateCompleted.
 */

function toDateOnly(v: string | null | undefined): Date | null {
  if (!v) return null;
  const s = String(v).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  const br = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(s);
  if (br) return new Date(Date.UTC(Number(br[3]), Number(br[2]) - 1, Number(br[1])));
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000);
}

function isBusinessDay(d: Date): boolean {
  const wd = d.getUTCDay();
  return wd !== 0 && wd !== 6;
}

/** Dias úteis (seg–sex) no intervalo fechado [inicio, fim]. */
export function businessDays(inicio: Date, fim: Date): Date[] {
  const out: Date[] = [];
  for (let d = inicio; d.getTime() <= fim.getTime(); d = addDays(d, 1)) {
    if (isBusinessDay(d)) out.push(d);
  }
  return out;
}

function isRealizado(e: ExecucaoRow, planKey: string): boolean {
  if ((e.plan_key ?? "").trim() !== planKey) return false;
  const s = statusCenario(e);
  return s === "passed" || s === "na";
}

/**
 * CTS PLAN DIA da aba Planejamento (=SUMIFS da distribuição diária até HOJE()): a QTD planejada da
 * suíte dividida igualmente pelos dias úteis entre início e fim, acumulada até a data de hoje.
 */
export function planejadoAteHoje(
  qtd: number,
  inicio: string | null,
  fim: string | null,
  hoje: Date = new Date(),
): number {
  const ini = toDateOnly(inicio);
  const end = toDateOnly(fim);
  if (!qtd || !ini || !end) return 0;
  const hojeUtc = new Date(Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()));
  const dias = businessDays(ini, end);
  if (dias.length === 0) return hojeUtc.getTime() >= ini.getTime() ? qtd : 0;
  const decorridos = dias.filter((d) => d.getTime() <= hojeUtc.getTime()).length;
  return Math.round((qtd * decorridos) / dias.length);
}

export function planejadoVsRealizado(
  linhas: PlanejamentoLinha[],
  execRows: ExecucaoRow[],
  planKey: string,
  periodo: { inicio: string; fim: string },
  hoje: Date = new Date(),
): GraficoPontoDia[] {
  const suites = linhas.filter((l) => l.processo && (Number(l.qtd_cts_plan) || 0) > 0);

  const inicios = suites.map((s) => toDateOnly(s.data_inicio)).filter(Boolean) as Date[];
  const fins = suites.map((s) => toDateOnly(s.data_fim)).filter(Boolean) as Date[];
  const inicio =
    toDateOnly(periodo.inicio) ??
    (inicios.length ? new Date(Math.min(...inicios.map((d) => d.getTime()))) : null);
  const fimCandidatos = [toDateOnly(periodo.fim), ...fins].filter(Boolean) as Date[];
  const fim = fimCandidatos.length
    ? new Date(Math.max(...fimCandidatos.map((d) => d.getTime())))
    : null;
  if (!inicio || !fim || fim.getTime() < inicio.getTime()) return [];

  const eixo = businessDays(inicio, fim);
  if (eixo.length === 0) return [];

  // Planejado por dia (soma do CTS PLAN DIA de cada suite ativa no dia)
  const planPorDia = new Map<string, number>(eixo.map((d) => [isoDay(d), 0]));
  for (const s of suites) {
    const plan = Number(s.qtd_cts_plan) || 0;
    const sIni = toDateOnly(s.data_inicio) ?? inicio;
    const sFim = toDateOnly(s.data_fim) ?? fim;
    const dias = businessDays(sIni, sFim);
    if (dias.length === 0) {
      // Sem janela válida: joga tudo no primeiro dia do eixo
      const k = isoDay(eixo[0]);
      planPorDia.set(k, (planPorDia.get(k) ?? 0) + plan);
      continue;
    }
    const porDia = plan / dias.length;
    for (const d of dias) {
      const k = isoDay(d);
      if (planPorDia.has(k)) planPorDia.set(k, (planPorDia.get(k) ?? 0) + porDia);
    }
  }

  // Realizado por dia (DateCompleted; fallback LastUpdatedDate)
  const realPorDia = new Map<string, number>();
  for (const e of execRows) {
    if (!isRealizado(e, planKey)) continue;
    const d = toDateOnly(e.date_completed) ?? toDateOnly(e.last_updated_date);
    if (!d) continue;
    const k = isoDay(d);
    realPorDia.set(k, (realPorDia.get(k) ?? 0) + 1);
  }
  // Execuções antes do início do eixo entram no primeiro ponto
  const primeiro = isoDay(eixo[0]);
  let realAntes = 0;
  for (const [k, v] of realPorDia) if (k < primeiro) realAntes += v;

  const hojeKey = isoDay(
    new Date(Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())),
  );

  let accPlan = 0;
  let accReal = realAntes;
  const pontos: GraficoPontoDia[] = [];
  // Para o realizado, também precisamos somar dias não úteis entre pontos
  let cursor = eixo[0];
  for (const d of eixo) {
    accPlan += planPorDia.get(isoDay(d)) ?? 0;
    // soma realizados de todos os dias (úteis ou não) desde o ponto anterior até d
    for (let x = cursor; x.getTime() <= d.getTime(); x = addDays(x, 1)) {
      accReal += realPorDia.get(isoDay(x)) ?? 0;
    }
    cursor = addDays(d, 1);
    const k = isoDay(d);
    pontos.push({
      data: k,
      planejado: Math.round(accPlan * 10) / 10,
      realizado: k <= hojeKey ? accReal : null,
    });
  }
  return pontos;
}

export function statusExecucoes(totais: {
  passeds: number;
  na: number;
  cancelados: number;
  falhados: number;
  bloqueados: number;
  liberados: number;
  design: number;
  naoLiberados: number;
}): GraficoFatia[] {
  return [
    { key: "passeds", label: "CTS Passeds", value: totais.passeds },
    { key: "na", label: "CTS N/A", value: totais.na },
    { key: "cancelados", label: "CTS Cancelados", value: totais.cancelados },
    { key: "falhados", label: "CTS Falhados", value: totais.falhados },
    { key: "bloqueados", label: "CTS Bloqueados", value: totais.bloqueados },
    { key: "liberados", label: "CTS Liberados", value: totais.liberados },
    { key: "design", label: "CTS Design", value: totais.design },
    { key: "naoLiberados", label: "CTS Não Liberados", value: totais.naoLiberados },
  ];
}
