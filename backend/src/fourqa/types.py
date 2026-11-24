"""Shared DTO types."""

from __future__ import annotations

from typing import Any, Literal, NotRequired, TypedDict

from fourqa.domain.dimensions import DetectedDimension
from fourqa.domain.evolucao_status import EvolucaoStatus
from fourqa.domain.status_frente import FrenteIndicadores


class ExecucaoRow(TypedDict, total=False):
    id: int
    plan_key: str | None
    plan_id: int | None
    plan_name: str | None
    frente: str | None
    atalho: str | None
    processo: str | None
    suite_id: int | None
    suite_name: str | None
    parent_suite_id: int | None
    suite_depth: int | None
    suite_path: str | None
    dimensions_json: str | None
    test_point_id: int | None
    test_case_id: int | None
    test_case_title: str | None
    case_priority: str | None
    responsabilidade: str | None
    test_case_state: str | None
    test_point_state: str | None
    outcome: str | None
    date_completed: str | None
    run_by: str | None
    last_updated_date: str | None
    last_test_run_id: int | None
    last_result_id: int | None
    test_case_link: str | None
    test_case_tags: str | None


class FalhaRow(TypedDict, total=False):
    id: int
    plan_key: str | None
    responsavel: str | None
    ambiente: str | None
    categoria: str | None
    bug_id: int | None
    impacto: float | None
    frente: str | None
    titulo: str | None
    status: str | None
    criacao: str | None
    fechamento: str | None
    links: str | None
    tags: str | None


class PlanejamentoLinha(TypedDict, total=False):
    row_num: int
    qa: str | None
    prioridades: str | None
    frente: str | None
    processo: str | None
    data_inicio: str | None
    data_fim: str | None
    replanejamento: float
    qtd_cts_plan: float | None
    cts_plan_dia: float | None
    cts_cancelados: float
    cts_passeds: float
    cts_na: float
    cts_falhados: float
    cts_bloqueados: float
    cts_liberados: float
    cts_design: float
    cts_nao_liberados: float
    total_realizado: float


class HomeImpactos(TypedDict):
    total_test_point_failed_blocked: int
    foursys: int
    cliente: int
    reteste: int


class HomeBugsPainel(TypedDict):
    total: int
    fechados: int
    abertos_dev: int
    fechados_dev: int
    abertos_cliente: int
    fechados_cliente: int
    reteste_resolved: int
    outros: int


class ReportSuiteRow(PlanejamentoLinha, total=False):
    suite_label: str
    ttl_cts: int
    gap: float
    aprov_uat_pct: float
    conclusao_e2e_pct: float
    status: EvolucaoStatus
    classificacao: dict[str, str]
    planejamento_origem: Literal["confirmado", "periodo_plano", "ausente"]


class HomeDto(TypedDict, total=False):
    title: str
    subtitle: str
    plan_key: str
    periodo: dict[str, str]
    atualizado_em: str
    ultima_importacao: str | None
    replanejamento_total: float
    ttl_cts: int
    gap: float
    status_totais: EvolucaoStatus
    percent_bugs_dev: float
    percent_bugs_cliente: float
    percent_total_impactados: float
    status_geral: EvolucaoStatus
    totais: dict[str, float | int]
    percentuais: dict[str, float]
    impactos: HomeImpactos
    suites: list[ReportSuiteRow]
    dimensoes: list[DetectedDimension]
    bugs: HomeBugsPainel
    graficos: "HomeGraficos"
    gestao_impactos: "HomeGestaoImpactos"


class GraficoPontoDia(TypedDict):
    data: str
    planejado: float
    realizado: float | None


class GraficoPontoDiaDetalhado(GraficoPontoDia):
    planejado_dia: float
    realizado_dia: float


ProgressSituacao = Literal["adiantado", "dentro", "atrasado"]


class PlanningProgressSnapshot(TypedDict):
    serie: list[GraficoPontoDiaDetalhado]
    planejado_ate_hoje: int
    realizado_ate_hoje: float
    diferenca: float
    situacao: ProgressSituacao


class GraficoFatia(TypedDict):
    key: str
    label: str
    value: float


class HomeGraficos(TypedDict):
    planejado_vs_realizado: list[GraficoPontoDia]
    status_execucoes: list[GraficoFatia]


class HomeGestaoImpactos(TypedDict):
    cards: dict[str, int]
    frentes: list[GraficoFatia]
    status: list[GraficoFatia]
    categoria: list[GraficoFatia]


class StatusFrenteCenarios(TypedDict):
    ttl: int
    plan: int
    plan_ate_hoje: int
    na: int
    passeds: int
    finalizado: int
    falha: int
    bloqueado: int
    liberado: int
    design: int
    nao_lib: int


class StatusFrenteBugs(TypedDict):
    total: int
    fechados: int
    abertos_dev: int
    fechados_dev: int
    abertos_cliente: int
    fechados_cliente: int
    reteste: int
    outros_uat: int
    impactos_dev: int
    impactos_cliente: int


class StatusFrenteBloco(TypedDict):
    frente: str
    cenarios: StatusFrenteCenarios
    bugs: StatusFrenteBugs
    indicadores: FrenteIndicadores


class StatusFrenteDto(TypedDict):
    plan_key: str
    blocos: list[StatusFrenteBloco]
    total: dict[str, Any]
    sobreposicao: bool


StatusCenario = Literal[
    "passed", "na", "falhado", "bloqueado", "design", "naoLiberado", "liberado"
]

SuiteStatus = Literal["done", "ok", "warn", "risk", "na"]
