import type { DetectedDimension } from "./domain/dimensions.js";

export type ExecucaoRow = {
  id: number;
  plan_key: string | null;
  plan_id: number | null;
  plan_name: string | null;
  frente: string | null;
  atalho: string | null;
  processo: string | null;
  suite_id: number | null;
  suite_name: string | null;
  parent_suite_id: number | null;
  suite_depth: number | null;
  /** JSON: ancestrais { suiteId, name, parentSuiteId, depth } */
  suite_path: string | null;
  /** JSON: chave da dimensão → valor naquele test point */
  dimensions_json: string | null;
  test_point_id: number | null;
  test_case_id: number | null;
  test_case_title: string | null;
  responsabilidade: string | null;
  test_case_state: string | null;
  test_point_state: string | null;
  outcome: string | null;
  date_completed: string | null;
  run_by: string | null;
  last_updated_date: string | null;
  last_test_run_id: number | null;
  last_result_id: number | null;
  test_case_link: string | null;
  test_case_tags: string | null;
};

export type FalhaRow = {
  id: number;
  plan_key: string | null;
  responsavel: string | null;
  ambiente: string | null;
  categoria: string | null;
  bug_id: number | null;
  impacto: number | null;
  frente: string | null;
  titulo: string | null;
  status: string | null;
  criacao: string | null;
  fechamento: string | null;
  links: string | null;
  tags: string | null;
};

export type PlanejamentoLinha = {
  row_num: number;
  qa: string | null;
  prioridades: string | null;
  frente: string | null;
  processo: string | null;
  data_inicio: string | null;
  data_fim: string | null;
  replanejamento: number;
  qtd_cts_plan: number | null;
  cts_plan_dia: number | null;
  cts_cancelados: number;
  cts_passeds: number;
  cts_na: number;
  cts_falhados: number;
  cts_bloqueados: number;
  cts_liberados: number;
  cts_design: number;
  cts_nao_liberados: number;
  total_realizado: number;
};

export type HomeImpactos = {
  totalTestPointFailedBlocked: number;
  foursys: number;
  cliente: number;
  reteste: number;
};

export type HomeBugsPainel = {
  total: number;
  fechados: number;
  abertosDev: number;
  fechadosDev: number;
  abertosCliente: number;
  fechadosCliente: number;
  retesteResolved: number;
  outros: number;
};

export type ReportSuiteRow = PlanejamentoLinha & {
  suiteLabel: string;
  ttlCts: number;
  gap: number;
  aprovUatPct: number;
  conclusaoE2ePct: number;
  status: "done" | "ok" | "warn" | "risk" | "na";
  /** Valores das dimensões detectadas (não assume Frente). */
  classificacao: Record<string, string>;
  /** confirmado = linha da planilha; periodo_plano = janela geral inferida; ausente = sem datas. */
  planejamentoOrigem: "confirmado" | "periodo_plano" | "ausente";
};

export type HomeDto = {
  title: string;
  subtitle: string;
  planKey: string;
  periodo: { inicio: string; fim: string; referencia: string };
  atualizadoEm: string;
  ultimaImportacao: string | null;
  replanejamentoTotal: number;
  ttlCts: number;
  gap: number;
  /** Linha Valores Totais: a mesma regra do card STATUS (maioria das suítes). */
  statusTotais: "done" | "ok" | "warn" | "risk" | "na";
  percentBugsDev: number;
  percentBugsCliente: number;
  percentTotalImpactados: number;
  statusGeral: "done" | "ok" | "warn" | "risk" | "na";
  totais: {
    ctsPlan: number;
    ctsPlanAteHoje: number;
    totalRealizado: number;
    passeds: number;
    na: number;
    cancelados: number;
    falhados: number;
    bloqueados: number;
    liberados: number;
    design: number;
    naoLiberados: number;
  };
  percentuais: { plan: number; real: number };
  impactos: HomeImpactos;
  suites: ReportSuiteRow[];
  /** Dimensões da árvore. Vazio quando não há agrupamento acima da suíte. */
  dimensoes: DetectedDimension[];
  bugs: HomeBugsPainel;
  graficos: HomeGraficos;
  gestaoImpactos: HomeGestaoImpactos;
};

/** Ponto do gráfico "Planejado Vs Realizado" (acumulado por dia útil). */
export type GraficoPontoDia = {
  data: string; // YYYY-MM-DD
  planejado: number;
  /** null para dias futuros (linha do realizado para em hoje). */
  realizado: number | null;
};

/** Ponto diário do progresso do planejamento Motor (distribuição + execução). */
export type GraficoPontoDiaDetalhado = GraficoPontoDia & {
  planejadoDia: number;
  realizadoDia: number;
};

export type PlanningProgressSnapshot = {
  serie: GraficoPontoDiaDetalhado[];
  planejadoAteHoje: number;
  realizadoAteHoje: number;
  diferenca: number;
  situacao: "adiantado" | "dentro" | "atrasado";
};

/** Fatia do gráfico "Status das Execuções". */
export type GraficoFatia = {
  key: string;
  label: string;
  value: number;
};

export type HomeGraficos = {
  planejadoVsRealizado: GraficoPontoDia[];
  statusExecucoes: GraficoFatia[];
};

/** Bloco "Gestão de Impactos" da Home (B78:B97 + gráficos de Regras de Calculo). */
export type HomeGestaoImpactos = {
  cards: {
    total: number;
    fechados: number;
    pendentes: number;
    emRetestes: number;
    abertosDev: number;
    abertosCliente: number;
    abertosOutros: number;
  };
  /** Bugs abertos por frente (um bug com várias frentes conta em cada uma). */
  frentes: GraficoFatia[];
  /** Bugs abertos por Status. */
  status: GraficoFatia[];
  /** Bugs abertos por Categoria. */
  categoria: GraficoFatia[];
};

export type StatusFrenteBloco = {
  frente: string;
  cenarios: {
    ttl: number;
    plan: number;
    finalizado: number;
    falha: number;
    bloqueado: number;
    liberado: number;
    design: number;
    naoLib: number;
  };
  bugs: {
    total: number;
    fechados: number;
    abertosDev: number;
    fechadosDev: number;
    abertosCliente: number;
    fechadosCliente: number;
    reteste: number;
    outrosUat: number;
  };
};
