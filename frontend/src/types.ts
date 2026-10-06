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

export type ReportSuiteRow = PlanejamentoLinha & {
  suiteLabel: string;
  ttlCts: number;
  gap: number;
  aprovUatPct: number;
  conclusaoE2ePct: number;
  status: "done" | "ok" | "warn" | "risk" | "na";
  classificacao?: Record<string, string>;
  planejamentoOrigem?: "confirmado" | "periodo_plano" | "ausente";
};

export type DetectedDimension = {
  key: string;
  label: string;
  level: number;
  values: string[];
  role: "priority" | "front" | "process" | "subprocess" | "generic";
  confidence: number;
  visible: boolean;
};

export type SyncState = {
  status: "idle" | "running" | "success" | "error";
  startedAt: string | null;
  finishedAt: string | null;
  step: string;
  progress: { done: number; total: number } | null;
  summary: {
    execucoes: number;
    falhas: number;
    suites: number;
    runs: number;
    kpi: { total: number; foursys: number; cliente: number; reteste: number } | null;
    duracaoMs: number;
  } | null;
  error: string | null;
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
  impactos: {
    totalTestPointFailedBlocked: number;
    foursys: number;
    cliente: number;
    reteste: number;
  };
  suites: ReportSuiteRow[];
  dimensoes?: DetectedDimension[];
  bugs: {
    total: number;
    fechados: number;
    abertosDev: number;
    fechadosDev: number;
    abertosCliente: number;
    fechadosCliente: number;
    retesteResolved: number;
    outros: number;
  };
  graficos: HomeGraficos;
  gestaoImpactos: HomeGestaoImpactos;
};

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
  frentes: GraficoFatia[];
  status: GraficoFatia[];
  categoria: GraficoFatia[];
};

export type GraficoPontoDia = {
  data: string;
  planejado: number;
  realizado: number | null;
};

export type GraficoFatia = {
  key: string;
  label: string;
  value: number;
};

export type HomeGraficos = {
  planejadoVsRealizado: GraficoPontoDia[];
  statusExecucoes: GraficoFatia[];
};

export type PlanningItem = {
  suiteId: number | null;
  suiteName: string;
  dimensions: Record<string, string>;
  plannedStart: string | null;
  plannedEnd: string | null;
  baselineCount: number | null;
  sourceCount: number | null;
  addedCount: number;
  removedCount: number;
  distributedCount: number;
  distributionGap: number | null;
  plannedToDate: number;
  finalizedCount: number | null;
  failed: number | null;
  blocked: number | null;
  passed: number | null;
  na: number | null;
  released: number | null;
  design: number | null;
  notReleased: number | null;
  unclassifiedCount: number;
  inconsistentCount: number;
  backlog: number | null;
  aheadOfPlan: number | null;
  allocations: Record<string, number>;
  warnings: string[];
};

export type PlanningView = {
  planning: { planKey: string };
  revision: {
    version: number | null;
    reason: string | null;
    createdAt: string | null;
    baselineOrigin: "legacy" | "motor" | "ausente";
    scopeSnapshotAvailable: boolean;
  } | null;
  summary: {
    baselineCount: number;
    sourceCount: number;
    addedCount: number;
    removedCount: number;
    scopeDelta: number;
    distributedCount: number;
    distributionGap: number;
    plannedToDate: number;
    finalizedCount: number;
    backlog: number;
    aheadOfPlan: number;
    classifiedCount: number;
    unclassifiedCount: number;
    inconsistentCount: number;
    scopeCheck: string | null;
  };
  dimensions: DetectedDimension[];
  dates: string[];
  items: PlanningItem[];
  integrity: { scope: string | null; classification: string | null; schedule: string | null };
  executionHistory: { reconstructed: false; note: string };
  revisions: { version: number; createdAt: string; reason: string }[];
  editable: boolean;
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

export type StatusFrenteDto = {
  planKey: string;
  blocos: StatusFrenteBloco[];
  total: StatusFrenteBloco["cenarios"] & {
    bugs: StatusFrenteBloco["bugs"];
  };
};

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
