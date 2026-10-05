import {
  getMeta,
  listExecucoes,
  listFalhas,
  listPlanejamentoBase,
} from "../db.js";
import {
  classificarImpactosKpi,
  countFalhas,
  DEFAULT_PLAN_KEY,
  impactoTotalTestPoint,
  metricasPorProcesso,
  sumifFrente,
  totalRealizadoLinha,
} from "../domain/formulas.js";
import { planejadoVsRealizado, statusExecucoes } from "../domain/graficos.js";
import type {
  HomeBugsPainel,
  HomeDto,
  PlanejamentoLinha,
  ReportSuiteRow,
  StatusFrenteBloco,
} from "../types.js";

function suiteLabel(processo: string): string {
  const p = processo.trim();
  if (p.length <= 36) return p;
  return `${p.slice(0, 33)}…`;
}

function suiteStatus(row: PlanejamentoLinha): ReportSuiteRow["status"] {
  if (row.cts_falhados > 0 || row.cts_bloqueados > 0) return "risk";
  if (row.cts_nao_liberados > 0 || row.cts_design > 0) return "warn";
  return "ok";
}

function buildReportSuites(
  linhas: PlanejamentoLinha[],
  execRows: ReturnType<typeof listExecucoes>,
): ReportSuiteRow[] {
  return linhas.map((row) => {
    const processo = row.processo ?? "";
    const ttlCts = execRows.filter(
      (e) => (e.suite_name ?? "") === processo || (e.processo ?? "") === processo,
    ).length;
    const plan = Number(row.qtd_cts_plan) || 0;
    const fin = row.total_realizado;
    const denom = plan || ttlCts || 1;
    return {
      ...row,
      suiteLabel: suiteLabel(processo),
      ttlCts: ttlCts || plan,
      gap: plan - fin,
      aprovUatPct: fin / denom,
      conclusaoE2ePct: row.cts_passeds / denom,
      status: suiteStatus(row),
    };
  });
}

const FRENTES_STATUS = ["GERORJ", "GESIN", "GEDEV", "GEFEA", "GEFIS", "GEMCO", "GERSA", "GEATE"];

/** Linha "Valores Totais >>>>>>>" da planilha: é SOMA das demais, não entra nos cálculos. */
function isLinhaTotais(row: { processo: string | null }): boolean {
  return /valores\s+totais/i.test(row.processo ?? "");
}

function buildPlanejamento(planKey: string): PlanejamentoLinha[] {
  const execRows = listExecucoes(planKey, 50000);
  const base = listPlanejamentoBase().filter((row) => !isLinhaTotais(row));
  return base.map((row) => {
    const m = metricasPorProcesso(execRows, planKey, row.processo ?? "");
    const cts_cancelados = Number(row.cts_cancelados) || 0;
    return {
      ...row,
      replanejamento: Number(row.replanejamento) || 0,
      qtd_cts_plan: row.qtd_cts_plan != null ? Number(row.qtd_cts_plan) : null,
      cts_plan_dia: row.cts_plan_dia != null ? Number(row.cts_plan_dia) : null,
      cts_cancelados,
      ...m,
      total_realizado: totalRealizadoLinha(m, cts_cancelados),
    };
  });
}

function sumTotals(linhas: PlanejamentoLinha[]) {
  const sum = (k: keyof PlanejamentoLinha) =>
    linhas.reduce((a, r) => a + (Number(r[k]) || 0), 0);
  return {
    ctsPlan: sum("qtd_cts_plan"),
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

function bugsPainel(planKey: string): HomeBugsPainel {
  const falhas = listFalhas(planKey, 50000);
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

function bugsPorFrente(planKey: string, frente: string) {
  const falhas = listFalhas(planKey, 50000);
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
    outrosUat: countFalhas(listFalhas("UAT", 50000), {
      planKey: "UAT",
      frenteContains: frente,
      responsavel: "Outros",
      fechamentoNotEmpty: true,
      idNotEmpty: true,
    }),
  };
}

export function getPlanejamento(planKey = DEFAULT_PLAN_KEY) {
  const linhas = buildPlanejamento(planKey);
  return {
    planKey,
    periodo: {
      inicio: getMeta("data_inicio") ?? "",
      fim: getMeta("data_fim") ?? "",
      referencia: getMeta("data_fim_linha") ?? "",
    },
    headers: [
      "QA",
      "Prioridades",
      "Frente",
      "Processo",
      "Data início",
      "Data fim",
      "Replanejamento",
      "QTD CTS PLAN",
      "CTS PLAN DIA",
      "Total realizado",
      "CTS Passeds",
      "CTS N/A",
      "CTS Cancelados",
      "CTS Falhados",
      "CTS Bloqueados",
      "CTS Liberados",
      "CTS Design",
      "CTS Não liberados",
    ],
    linhas,
    totais: sumTotals(linhas),
  };
}

export function getHome(planKey = DEFAULT_PLAN_KEY): HomeDto {
  const linhas = buildPlanejamento(planKey);
  const totais = sumTotals(linhas);
  const execRows = listExecucoes(planKey, 50000);
  const falhas = listFalhas(planKey, 50000);
  const kpi = classificarImpactosKpi(execRows, falhas, planKey);
  const bugs = bugsPainel(planKey);

  const ctsPlan = totais.ctsPlan || 1;
  const ttlCts = execRows.length;
  const impactoTotal = impactoTotalTestPoint(execRows, planKey);
  const suites = buildReportSuites(linhas, execRows);

  let statusGeral: HomeDto["statusGeral"] = "ok";
  if (totais.falhados > 0 || totais.bloqueados > 0 || impactoTotal > 0) statusGeral = "risk";
  else if (totais.naoLiberados > 0 || totais.design > 0) statusGeral = "warn";

  const bugDenom = Math.max(bugs.total, 1);
  const periodo = {
    inicio: getMeta("data_inicio") ?? "",
    fim: getMeta("data_fim") ?? "",
    referencia: getMeta("data_fim_linha") ?? "",
  };
  return {
    title: (getMeta("title") ?? "STATUS REPORT QA").trim(),
    subtitle:
      "FASE - Execução QA - Testes EndToEnd - Validacão da V1 para V3",
    planKey,
    periodo,
    atualizadoEm: new Date().toISOString(),
    ultimaImportacao: getMeta("imported_at"),
    replanejamentoTotal: linhas.reduce((a, r) => a + r.replanejamento, 0),
    ttlCts,
    gap: totais.ctsPlan - totais.totalRealizado,
    percentBugsDev: bugs.abertosDev / bugDenom,
    percentBugsCliente: bugs.abertosCliente / bugDenom,
    percentTotalImpactados: impactoTotal / Math.max(ttlCts, 1),
    statusGeral,
    totais,
    percentuais: {
      plan: totais.totalRealizado / ctsPlan,
      real: totais.passeds / ctsPlan,
    },
    impactos: {
      totalTestPointFailedBlocked: impactoTotal,
      foursys: kpi.foursys,
      cliente: kpi.cliente,
      reteste: kpi.reteste,
    },
    suites,
    bugs,
    graficos: {
      planejadoVsRealizado: planejadoVsRealizado(linhas, execRows, planKey, periodo),
      statusExecucoes: statusExecucoes(totais),
    },
  };
}

export function getStatusPorFrente(planKey = DEFAULT_PLAN_KEY): {
  planKey: string;
  blocos: StatusFrenteBloco[];
  total: StatusFrenteBloco["cenarios"] & { bugs: StatusFrenteBloco["bugs"] };
} {
  const linhas = buildPlanejamento(planKey);
  const frentesPresentes = [
    ...new Set(linhas.map((l) => l.frente).filter(Boolean) as string[]),
  ];
  const frentes = frentesPresentes.length
    ? frentesPresentes
    : FRENTES_STATUS.filter((f) =>
        linhas.some((l) => (l.frente ?? "").toUpperCase().includes(f)),
      );

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
    bugs: bugsPorFrente(planKey, frente),
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
