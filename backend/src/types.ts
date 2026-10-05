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
  status: "ok" | "warn" | "risk";
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
  percentBugsDev: number;
  percentBugsCliente: number;
  percentTotalImpactados: number;
  statusGeral: "ok" | "warn" | "risk";
  totais: {
    ctsPlan: number;
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
  bugs: HomeBugsPainel;
  graficos: HomeGraficos;
};

/** Ponto do gráfico "Planejado Vs Realizado" (acumulado por dia útil). */
export type GraficoPontoDia = {
  data: string; // YYYY-MM-DD
  planejado: number;
  /** null para dias futuros (linha do realizado para em hoje). */
  realizado: number | null;
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
