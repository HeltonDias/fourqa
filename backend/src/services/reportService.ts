import {
  getMeta,
  listExecucoesAll,
  listFalhasAll,
  listPlanejamentoBase,
  setMeta,
} from "../db.js";
import { inferDimensions, type DetectedDimension } from "../domain/dimensions.js";
import {
  classificarImpactosKpi,
  countFalhas,
  DEFAULT_PLAN_KEY,
  impactoTotalTestPoint,
  metricasDosPontos,
  sumifFrente,
  totalRealizadoLinha,
} from "../domain/formulas.js";
import { statusEvolucao, statusGeralDe } from "../domain/evolucaoStatus.js";
import { planejadoAteHoje, planejadoVsRealizado, statusExecucoes } from "../domain/graficos.js";
import { groupExecucoesForReport } from "../domain/reportGroups.js";
import { assertPlanningPeriod, assertStoredPlanningPeriod } from "../domain/planPeriod.js";
import type {
  GraficoFatia,
  HomeBugsPainel,
  HomeDto,
  HomeGestaoImpactos,
  ExecucaoRow,
  FalhaRow,
  PlanejamentoLinha,
  ReportSuiteRow,
  StatusFrenteBloco,
} from "../types.js";

function suiteLabel(processo: string): string {
  const p = processo.trim();
  if (p.length <= 36) return p;
  return `${p.slice(0, 33)}…`;
}

function buildReportSuites(linhas: ReturnType<typeof buildPlanejamento>): ReportSuiteRow[] {
  return linhas.map((row) => {
    const processo = row.processo ?? "";
    const ttlCts = Number(row.qtd_cts_plan) || 0;
    const fin = row.total_realizado;
    // Home K20 = Planejamento T8 (BACKLOG) = CTS PLAN DIA − (Passed + N/A + Cancelados)
    const gap = (Number(row.cts_plan_dia) || 0) - fin;
    const denom = ttlCts || 1;
    return {
      ...row,
      suiteLabel: suiteLabel(processo),
      ttlCts,
      gap,
      aprovUatPct: fin / denom,
      conclusaoE2ePct: row.cts_passeds / denom,
      status: statusEvolucao({
        gap,
        ttlCts,
        finalizados: fin,
        na: Number(row.cts_na) || 0,
      }),
    };
  });
}

/** Linha "Valores Totais >>>>>>>" da planilha: é SOMA das demais, não entra nos cálculos. */
function isLinhaTotais(row: { processo: string | null }): boolean {
  return /valores\s+totais/i.test(row.processo ?? "");
}

function periodoGeral() {
  return {
    inicio: getMeta("data_inicio") ?? "",
    fim: getMeta("data_fim") ?? "",
    referencia: getMeta("data_fim_linha") ?? "",
  };
}

/**
 * Uma linha por combinação das dimensões visíveis quando existe papel process.
 * Sem process, uma linha por suíte (plano legado).
 * QTD CTS PLAN = Test Points do grupo. Da aba Planejamento só entram dados que o Azure não tem
 * (QA, prioridade, datas, replanejamento, cancelados); quantidades legadas entram uma vez por processo.
 */
function buildPlanejamento(_planKey: string, execRows: ExecucaoRow[], dimensoes: DetectedDimension[]) {
  const periodo = periodoGeral();
  const key = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
  const planejamento = new Map(
    listPlanejamentoBase()
      .filter((row) => !isLinhaTotais(row))
      .map((row) => [key(row.processo), row] as const),
  );
  const legacyQtyApplied = new Set<string>();

  return groupExecucoesForReport(execRows, dimensoes).map((s, i) => {
    const legacyKey = key(s.processo);
    const p = planejamento.get(legacyKey);
    const applyLegacyQty = Boolean(p) && !legacyQtyApplied.has(legacyKey);
    if (applyLegacyQty) legacyQtyApplied.add(legacyKey);
    const pontos = s.rows;
    const m = metricasDosPontos(pontos);
    const cts_cancelados = applyLegacyQty ? Number(p?.cts_cancelados) || 0 : 0;
    const qtd = pontos.length;
    const datasConfirmadas = Boolean(p?.data_inicio || p?.data_fim);
    const data_inicio = p?.data_inicio || periodo.inicio || null;
    const data_fim = p?.data_fim || periodo.fim || null;
    return {
      row_num: i + 1,
      qa: p?.qa ?? null,
      prioridades: p?.prioridades ?? null,
      frente: s.frente,
      processo: s.processo,
      data_inicio,
      data_fim,
      replanejamento: applyLegacyQty ? Number(p?.replanejamento) || 0 : 0,
      qtd_cts_plan: qtd,
      cts_plan_dia: planejadoAteHoje(qtd, data_inicio, data_fim),
      cts_cancelados,
      ...m,
      total_realizado: totalRealizadoLinha(m, cts_cancelados),
      classificacao: s.classificacao,
      planejamentoOrigem: datasConfirmadas
        ? ("confirmado" as const)
        : data_inicio || data_fim
          ? ("periodo_plano" as const)
          : ("ausente" as const),
    };
  });
}

function sumTotals(linhas: PlanejamentoLinha[]) {
  const sum = (k: keyof PlanejamentoLinha) =>
    linhas.reduce((a, r) => a + (Number(r[k]) || 0), 0);
  return {
    ctsPlan: sum("qtd_cts_plan"),
    ctsPlanAteHoje: sum("cts_plan_dia"),
    totalRealizado: sum("total_realizado"),
    passeds: sum("cts_passeds"),
    na: sum("cts_na"),
    cancelados: sum("cts_cancelados"),
    falhados: sum("cts_falhados"),
    bloqueados: sum("cts_bloqueados"),
    liberados: sum("cts_liberados"),
    design: sum("cts_design"),
    naoLiberados: sum("cts_nao_liberados"),
  };
}

function contarPor(rows: { value: string }[]): GraficoFatia[] {
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.value, (counts.get(r.value) ?? 0) + 1);
  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b, "pt-BR"))
    .map(([label, value]) => ({ key: label, label, value }));
}

function gestaoImpactos(planKey: string, falhas: FalhaRow[]): HomeGestaoImpactos {
  const bugs = falhas.filter((f) => (f.plan_key ?? "").trim() === planKey && f.bug_id != null);
  const vazio = (v: string | null) => (v ?? "").trim() === "";
  const abertos = bugs.filter((f) => vazio(f.fechamento));
  const status = (f: (typeof bugs)[number]) => (f.status ?? "").trim();
  const abertosPor = (responsavel: string) =>
    abertos.filter((f) => status(f) !== "Resolved" && (f.responsavel ?? "").trim() === responsavel)
      .length;
  const fechados = bugs.filter((f) => !vazio(f.fechamento)).length;

  return {
    cards: {
      total: bugs.length,
      fechados,
      pendentes: bugs.length - fechados,
      emRetestes: abertos.filter((f) => status(f) === "Resolved").length,
      abertosDev: abertosPor("Desenvolvimento Foursys"),
      abertosCliente: abertosPor("Cliente CVP"),
      abertosOutros: abertosPor("Outros"),
    },
    frentes: contarPor(
      abertos.flatMap((f) =>
        (f.frente ?? "")
          .split("|")
          .map((parte) => parte.trim())
          .filter(Boolean)
          .map((value) => ({ value })),
      ),
    ),
    status: contarPor(abertos.map((f) => ({ value: status(f) || "(vazio)" }))),
    categoria: contarPor(abertos.map((f) => ({ value: (f.categoria ?? "").trim() || "(vazio)" }))),
  };
}

function bugsPainel(planKey: string, falhas: FalhaRow[]): HomeBugsPainel {
  return {
    total: countFalhas(falhas, { planKey, idNotEmpty: true }),
    fechados: countFalhas(falhas, { planKey, fechamentoNotEmpty: true }),
    abertosDev: countFalhas(falhas, {
      planKey,
      fechamentoEmpty: true,
      statusNot: "Resolved",
      responsavel: "Desenvolvimento Foursys",
      idNotEmpty: true,
    }),
    fechadosDev: countFalhas(falhas, {
      planKey,
      fechamentoEmpty: true,
      status: "Resolved",
      responsavel: "Desenvolvimento Foursys",
      idNotEmpty: true,
    }),
    abertosCliente: countFalhas(falhas, {
      planKey,
      fechamentoEmpty: true,
      statusNot: "Resolved",
      responsavel: "Cliente CVP",
      idNotEmpty: true,
    }),
    fechadosCliente: countFalhas(falhas, {
      planKey,
      status: "Closed",
      responsavel: "Cliente CVP",
    }),
    retesteResolved: countFalhas(falhas, {
      planKey,
      status: "Resolved",
    }),
    outros: countFalhas(falhas, {
      planKey,
      fechamentoEmpty: true,
      statusNot: "Resolved",
      responsavel: "Outros",
      idNotEmpty: true,
    }),
  };
}

function bugsPorFrente(planKey: string, frente: string, falhas: FalhaRow[], falhasUat: FalhaRow[]) {
  const base = { planKey, frenteContains: frente, idNotEmpty: true as const };
  return {
    total: countFalhas(falhas, base),
    fechados: countFalhas(falhas, { ...base, status: "Closed" }),
    abertosDev:
      countFalhas(falhas, {
        ...base,
        responsavel: "Desenvolvimento Foursys",
        status: "New",
      }) +
      countFalhas(falhas, {
        ...base,
        responsavel: "Desenvolvimento Foursys",
        status: "Active",
      }),
    fechadosDev: countFalhas(falhas, {
      ...base,
      responsavel: "Desenvolvimento Foursys",
      status: "Closed",
    }),
    abertosCliente:
      countFalhas(falhas, {
        ...base,
        responsavel: "Cliente CVP",
        status: "New",
      }) +
      countFalhas(falhas, {
        ...base,
        responsavel: "Cliente CVP",
        status: "Active",
      }),
    fechadosCliente: countFalhas(falhas, {
      ...base,
      responsavel: "Cliente CVP",
      status: "Closed",
    }),
    reteste: countFalhas(falhas, { ...base, status: "Resolved" }),
    outrosUat: countFalhas(falhasUat, {
      planKey: "UAT",
      frenteContains: frente,
      responsavel: "Outros",
      fechamentoNotEmpty: true,
      idNotEmpty: true,
    }),
  };
}

function catalogoDimensoes(planKey: string, execRows: ExecucaoRow[]): DetectedDimension[] {
  const raw = getMeta(`dimensoes_catalog:${planKey}`);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as DetectedDimension[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed.filter((d) => d.visible !== false);
    } catch {
      /* catálogo inválido: infere pelas linhas */
    }
  }
  return inferDimensions(execRows);
}

function readStoredKpi(planKey: string): { foursys: number; cliente: number; reteste: number } | null {
  const raw = getMeta(`kpi_impactos:${planKey}`);
  if (!raw) return null;
  try {
    const k = JSON.parse(raw) as Record<string, unknown>;
    const nums = [k.foursys, k.cliente, k.reteste];
    if (!nums.every((n) => typeof n === "number" && Number.isFinite(n))) return null;
    return { foursys: k.foursys as number, cliente: k.cliente as number, reteste: k.reteste as number };
  } catch {
    return null;
  }
}

export function getCabecalho(): { title: string; subtitle: string } {
  return {
    title: (getMeta("cabecalho_titulo") ?? getMeta("title") ?? "STATUS REPORT QA").trim(),
    subtitle: (
      getMeta("cabecalho_subtitulo") ??
      "FASE - Execução QA - Testes EndToEnd - Validacão da V1 para V3"
    ).trim(),
  };
}

export function setCabecalho(title: string, subtitle: string): { title: string; subtitle: string } {
  setMeta("cabecalho_titulo", title.trim());
  setMeta("cabecalho_subtitulo", subtitle.trim());
  return getCabecalho();
}

export function setPeriodoPlano(inicio: string, fim: string): HomeDto["periodo"] {
  const { inicio: start, fim: end } = assertPlanningPeriod(inicio, fim);
  setMeta("data_inicio", start);
  setMeta("data_fim", end);
  return periodoGeral();
}

export function getHome(planKey = DEFAULT_PLAN_KEY): HomeDto {
  const periodo = periodoGeral();
  assertStoredPlanningPeriod(periodo.inicio, periodo.fim);

  const execRows = listExecucoesAll(planKey);
  const falhas = listFalhasAll(planKey);
  const dimensoes = catalogoDimensoes(planKey, execRows);
  const linhas = buildPlanejamento(planKey, execRows, dimensoes);
  const totais = sumTotals(linhas);
  // Prefere o KPI exato calculado na última sincronização com o Azure; senão, aproxima pelos dados locais.
  const kpi = readStoredKpi(planKey) ?? classificarImpactosKpi(execRows, falhas, planKey);
  const bugs = bugsPainel(planKey, falhas);

  // Home H6 = I44/H44 e I6 = J44/H44: planejado até hoje e finalizados sobre a QTD CTS PLAN total.
  const sobreTtl = (x: number) => (totais.ctsPlan > 0 ? x / totais.ctsPlan : 0);
  const ttlCts = totais.ctsPlan;
  // Regras de Calculo D8: CTs executados = Passed + Falhados + Bloqueados (Planejamento L32+O32+P32)
  const executados = totais.passeds + totais.falhados + totais.bloqueados;
  const sobreExecutados = (x: number) => (executados > 0 ? x / executados : 0);
  const falhasPor = (responsavel: string) =>
    falhas.filter((f) => (f.responsavel ?? "").trim() === responsavel).length;
  const impactoTotal = impactoTotalTestPoint(execRows, planKey);
  const suites = buildReportSuites(linhas);
  const statusGeral = statusGeralDe(suites.map((s) => s.status));
  const gapTotal = suites.reduce((a, s) => a + s.gap, 0);

  return {
    ...getCabecalho(),
    planKey,
    periodo,
    atualizadoEm: new Date().toISOString(),
    ultimaImportacao: getMeta("ultima_sincronizacao_azure") ?? getMeta("imported_at"),
    replanejamentoTotal: linhas.reduce((a, r) => a + r.replanejamento, 0),
    ttlCts,
    // Home J6 = Planejamento T32 (Σ BACKLOG)
    gap: gapTotal,
    statusTotais: statusGeral,
    // Home C6/D6/E6 = Regras de Calculo F8/G8/E8: falhas do plano por responsável ÷ CTs executados
    percentBugsDev: sobreExecutados(falhasPor("Desenvolvimento Foursys")),
    percentBugsCliente: sobreExecutados(falhasPor("Cliente CVP")),
    percentTotalImpactados: sobreExecutados(falhas.length),
    statusGeral,
    totais,
    percentuais: {
      plan: sobreTtl(totais.ctsPlanAteHoje),
      real: sobreTtl(totais.totalRealizado),
    },
    impactos: {
      totalTestPointFailedBlocked: impactoTotal,
      foursys: kpi.foursys,
      cliente: kpi.cliente,
      reteste: kpi.reteste,
    },
    suites,
    dimensoes,
    bugs,
    graficos: {
      planejadoVsRealizado: planejadoVsRealizado(linhas, execRows, planKey, periodo),
      statusExecucoes: statusExecucoes(totais),
    },
    gestaoImpactos: gestaoImpactos(planKey, falhas),
  };
}

export function getStatusPorFrente(planKey = DEFAULT_PLAN_KEY): {
  planKey: string;
  blocos: StatusFrenteBloco[];
  total: StatusFrenteBloco["cenarios"] & { bugs: StatusFrenteBloco["bugs"] };
} {
  assertStoredPlanningPeriod(periodoGeral().inicio, periodoGeral().fim);
  const execRows = listExecucoesAll(planKey);
  const dimensoes = catalogoDimensoes(planKey, execRows);
  const linhas = buildPlanejamento(planKey, execRows, dimensoes);
  const frenteDim = dimensoes.find((d) => d.role === "front" && d.confidence >= 0.8);
  const frentes = frenteDim?.values ?? [];
  const falhas = listFalhasAll(planKey);
  const falhasUat = planKey.toLowerCase() === "uat" ? falhas : listFalhasAll("UAT");

  const blocos: StatusFrenteBloco[] = frentes.map((frente) => ({
    frente,
    cenarios: {
      ttl: sumifFrente(linhas, frente, "qtd_cts_plan"),
      plan: sumifFrente(linhas, frente, "qtd_cts_plan"),
      finalizado: sumifFrente(linhas, frente, "total_realizado"),
      falha: sumifFrente(linhas, frente, "cts_falhados"),
      bloqueado: sumifFrente(linhas, frente, "cts_bloqueados"),
      liberado: sumifFrente(linhas, frente, "cts_liberados"),
      design: sumifFrente(linhas, frente, "cts_design"),
      naoLib: sumifFrente(linhas, frente, "cts_nao_liberados"),
    },
    bugs: bugsPorFrente(planKey, frente, falhas, falhasUat),
  }));

  const totalCenarios = blocos.reduce(
    (acc, b) => {
      acc.ttl += b.cenarios.ttl;
      acc.plan += b.cenarios.plan;
      acc.finalizado += b.cenarios.finalizado;
      acc.falha += b.cenarios.falha;
      acc.bloqueado += b.cenarios.bloqueado;
      acc.liberado += b.cenarios.liberado;
      acc.design += b.cenarios.design;
      acc.naoLib += b.cenarios.naoLib;
      return acc;
    },
    {
      ttl: 0,
      plan: 0,
      finalizado: 0,
      falha: 0,
      bloqueado: 0,
      liberado: 0,
      design: 0,
      naoLib: 0,
    },
  );

  const bugsTotal = blocos.reduce(
    (acc, b) => {
      acc.total += b.bugs.total;
      acc.fechados += b.bugs.fechados;
      acc.abertosDev += b.bugs.abertosDev;
      acc.fechadosDev += b.bugs.fechadosDev;
      acc.abertosCliente += b.bugs.abertosCliente;
      acc.fechadosCliente += b.bugs.fechadosCliente;
      acc.reteste += b.bugs.reteste;
      acc.outrosUat += b.bugs.outrosUat;
      return acc;
    },
    {
      total: 0,
      fechados: 0,
      abertosDev: 0,
      fechadosDev: 0,
      abertosCliente: 0,
      fechadosCliente: 0,
      reteste: 0,
      outrosUat: 0,
    },
  );

  return {
    planKey,
    blocos,
    total: { ...totalCenarios, bugs: bugsTotal },
  };
}
