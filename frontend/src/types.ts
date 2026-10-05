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
  impactos: {
    totalTestPointFailedBlocked: number;
    foursys: number;
    cliente: number;
    reteste: number;
  };
  suites: ReportSuiteRow[];
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

export type PlanejamentoDto = {
  planKey: string;
  periodo: { inicio: string; fim: string; referencia: string };
  headers: string[];
  linhas: PlanejamentoLinha[];
  totais: HomeDto["totais"];
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
  frente: string | null;
  processo: string | null;
  suite_name: string | null;
  test_case_title: string | null;
  test_case_state: string | null;
  test_point_state: string | null;
  outcome: string | null;
  responsabilidade: string | null;
};

export type FalhaRow = {
  id: number;
  plan_key: string | null;
  bug_id: number | null;
  responsavel: string | null;
  frente: string | null;
  titulo: string | null;
  status: string | null;
  impacto: number | null;
  criacao: string | null;
  fechamento: string | null;
};
