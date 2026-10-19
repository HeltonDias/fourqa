import { getStores } from "../persistence/provider.js";
import type { LegacyPlanRow } from "../persistence/contracts.js";
import { inferDimensions, type DetectedDimension } from "../domain/dimensions.js";
import { isLegacyPlanOwner } from "../domain/legacyPlanOwner.js";
import {
  classificarImpactosKpi,
  countFalhas,
  DEFAULT_PLAN_KEY,
  finalizadosComCancelados,
  impactoTotalTestPoint,
  metricasDosPontos,
  sumifFrente,
  totalRealizadoLinha,
} from "../domain/formulas.js";
import { statusEvolucao, statusGeralDe } from "../domain/evolucaoStatus.js";
import { haSobreposicaoFrentes, indicadoresFrente } from "../domain/statusFrente.js";
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
  StatusFrenteBugs,
  StatusFrenteCenarios,
  StatusFrenteDto,
} from "../types.js";

const stores = await getStores();
const getMeta = async (key: string) => stores.meta.get(key);
const setMeta = async (key: string, value: string) => stores.meta.set(key, value);
const listExecucoesAll = async (planKey: string) => stores.azureSnapshot.listExecucoes(planKey);
const listFalhasAll = async (planKey: string) => stores.azureSnapshot.listFalhas(planKey);
const listPlanejamentoBase = async () => stores.legacyPlan.listBase();

function suiteLabel(processo: string): string {
  const p = processo.trim();
  if (p.length <= 36) return p;
  return `${p.slice(0, 33)}…`;
}

function buildReportSuites(linhas: Awaited<ReturnType<typeof buildPlanejamento>>): ReportSuiteRow[] {
  return linhas.map((row) => {
    const processo = row.processo ?? "";
    const ttlCts = Number(row.qtd_cts_plan) || 0;
    const fin = row.total_realizado;
    // GAP do Report = planejado até hoje − (Passed + N/A). Cancelados não entram.
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

async function periodoGeral() {
  return {
    inicio: (await getMeta("data_inicio")) ?? "",
    fim: (await getMeta("data_fim")) ?? "",
    referencia: (await getMeta("data_fim_linha")) ?? "",
  };
}

/**
 * planejamento_linhas não tem plan_key. O Report só enriquece o plano dono
 * gravado em planejamento_legado_plan_key. A leitura da tabela continua bruta.
 */
async function legacyBaseForReport(planKey: string): Promise<LegacyPlanRow[]> {
  if (!isLegacyPlanOwner(planKey, await getMeta("planejamento_legado_plan_key"))) return [];
  return (await listPlanejamentoBase()).filter((row) => !isLinhaTotais(row));
}

/**
 * Uma linha por combinação das dimensões visíveis quando existe papel process.
 * Sem process, uma linha por suíte (plano legado).
 * QTD CTS PLAN = Test Points do grupo. Da aba Planejamento só entram dados que o Azure não tem
 * (QA, prioridade, datas, replanejamento, cancelados); quantidades legadas entram uma vez por processo.
 */
async function buildPlanejamento(planKey: string, execRows: ExecucaoRow[], dimensoes: DetectedDimension[]) {
  const periodo = await periodoGeral();
  const key = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
  const planejamento = new Map(
    (await legacyBaseForReport(planKey)).map((row) => [key(row.processo), row] as const),
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
      total_realizado: totalRealizadoLinha(m),
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
    impactosDev: countFalhas(falhas, { ...base, responsavel: "Desenvolvimento Foursys" }),
    impactosCliente: countFalhas(falhas, { ...base, responsavel: "Cliente CVP" }),
  };
}

async function catalogoDimensoes(planKey: string, execRows: ExecucaoRow[]): Promise<DetectedDimension[]> {
  const raw = await getMeta(`dimensoes_catalog:${planKey}`);
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

async function readStoredKpi(planKey: string): Promise<{ foursys: number; cliente: number; reteste: number } | null> {
  const raw = await getMeta(`kpi_impactos:${planKey}`);
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

export async function getCabecalho(): Promise<{ title: string; subtitle: string }> {
  return {
    title: ((await getMeta("cabecalho_titulo")) ?? (await getMeta("title")) ?? "STATUS REPORT QA").trim(),
    subtitle: (
      (await getMeta("cabecalho_subtitulo")) ??
      "FASE - Execução QA - Testes EndToEnd - Validacão da V1 para V3"
    ).trim(),
  };
}

export async function setCabecalho(title: string, subtitle: string): Promise<{ title: string; subtitle: string }> {
  await setMeta("cabecalho_titulo", title.trim());
  await setMeta("cabecalho_subtitulo", subtitle.trim());
  return getCabecalho();
}

export async function setPeriodoPlano(inicio: string, fim: string): Promise<HomeDto["periodo"]> {
  const { inicio: start, fim: end } = assertPlanningPeriod(inicio, fim);
  await setMeta("data_inicio", start);
  await setMeta("data_fim", end);
  return periodoGeral();
}

export async function getHome(planKey = DEFAULT_PLAN_KEY): Promise<HomeDto> {
  const periodo = await periodoGeral();
  assertStoredPlanningPeriod(periodo.inicio, periodo.fim);

  const execRows = await listExecucoesAll(planKey);
  const falhas = await listFalhasAll(planKey);
  const dimensoes = await catalogoDimensoes(planKey, execRows);
  const linhas = await buildPlanejamento(planKey, execRows, dimensoes);
  const totais = sumTotals(linhas);
  // Prefere o KPI exato calculado na última sincronização com o Azure; senão, aproxima pelos dados locais.
  const kpi = (await readStoredKpi(planKey)) ?? classificarImpactosKpi(execRows, falhas, planKey);
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
    ...(await getCabecalho()),
    planKey,
    periodo,
    atualizadoEm: new Date().toISOString(),
    ultimaImportacao: (await getMeta("ultima_sincronizacao_azure")) ?? (await getMeta("imported_at")),
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

const CENARIOS_ZERO: StatusFrenteCenarios = {
  ttl: 0,
  plan: 0,
  planAteHoje: 0,
  na: 0,
  passeds: 0,
  finalizado: 0,
  falha: 0,
  bloqueado: 0,
  liberado: 0,
  design: 0,
  naoLib: 0,
};

const BUGS_ZERO: StatusFrenteBugs = {
  total: 0,
  fechados: 0,
  abertosDev: 0,
  fechadosDev: 0,
  abertosCliente: 0,
  fechadosCliente: 0,
  reteste: 0,
  outrosUat: 0,
  impactosDev: 0,
  impactosCliente: 0,
};

function indicadoresDoBloco(cenarios: StatusFrenteCenarios, bugs: StatusFrenteBugs) {
  return indicadoresFrente({
    ttl: cenarios.ttl,
    planAteHoje: cenarios.planAteHoje,
    finalizado: cenarios.finalizado,
    na: cenarios.na,
    passeds: cenarios.passeds,
    falha: cenarios.falha,
    bloqueado: cenarios.bloqueado,
    impactosDev: bugs.impactosDev,
    impactosCliente: bugs.impactosCliente,
    bugsTotal: bugs.total,
    bugsFechados: bugs.fechados,
  });
}

function somarBlocos(blocos: StatusFrenteBloco[]): Omit<StatusFrenteBloco, "frente"> {
  const cenarios = { ...CENARIOS_ZERO };
  const bugs = { ...BUGS_ZERO };
  for (const bloco of blocos) {
    (Object.keys(cenarios) as (keyof StatusFrenteCenarios)[]).forEach((key) => {
      cenarios[key] += bloco.cenarios[key];
    });
    (Object.keys(bugs) as (keyof StatusFrenteBugs)[]).forEach((key) => {
      bugs[key] += bloco.bugs[key];
    });
  }
  const indicadores = indicadoresDoBloco(cenarios, bugs);
  // A face do conjunto é a maioria das frentes, como na Home. Os números continuam a soma.
  if (blocos.length > 0) indicadores.status = statusGeralDe(blocos.map((bloco) => bloco.indicadores.status));
  return { cenarios, bugs, indicadores };
}

export async function getStatusPorFrente(planKey = DEFAULT_PLAN_KEY): Promise<StatusFrenteDto> {
  const periodo = await periodoGeral();
  assertStoredPlanningPeriod(periodo.inicio, periodo.fim);
  const execRows = await listExecucoesAll(planKey);
  const dimensoes = await catalogoDimensoes(planKey, execRows);
  const linhas = await buildPlanejamento(planKey, execRows, dimensoes);
  const frenteDim = dimensoes.find((d) => d.role === "front" && d.confidence >= 0.8);
  const frentes = frenteDim?.values ?? [];
  const falhas = await listFalhasAll(planKey);
  const falhasUat = planKey.toLowerCase() === "uat" ? falhas : await listFalhasAll("UAT");

  const blocos: StatusFrenteBloco[] = frentes.map((frente) => {
    const ttl = sumifFrente(linhas, frente, "qtd_cts_plan");
    const cenarios: StatusFrenteCenarios = {
      ttl,
      plan: ttl,
      planAteHoje: sumifFrente(linhas, frente, "cts_plan_dia"),
      na: sumifFrente(linhas, frente, "cts_na"),
      passeds: sumifFrente(linhas, frente, "cts_passeds"),
      finalizado: finalizadosComCancelados(
        {
          cts_passeds: sumifFrente(linhas, frente, "cts_passeds"),
          cts_na: sumifFrente(linhas, frente, "cts_na"),
        },
        sumifFrente(linhas, frente, "cts_cancelados"),
      ),
      falha: sumifFrente(linhas, frente, "cts_falhados"),
      bloqueado: sumifFrente(linhas, frente, "cts_bloqueados"),
      liberado: sumifFrente(linhas, frente, "cts_liberados"),
      design: sumifFrente(linhas, frente, "cts_design"),
      naoLib: sumifFrente(linhas, frente, "cts_nao_liberados"),
    };
    const bugs = bugsPorFrente(planKey, frente, falhas, falhasUat);
    return { frente, cenarios, bugs, indicadores: indicadoresDoBloco(cenarios, bugs) };
  });

  return {
    planKey,
    blocos,
    total: somarBlocos(blocos),
    sobreposicao: haSobreposicaoFrentes(frentes),
  };
}
