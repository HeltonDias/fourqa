"""Indicadores por frente."""

from __future__ import annotations

from typing import TypedDict

from fourqa.domain.evolucao_status import EvolucaoStatus, status_evolucao


class FrenteContagens(TypedDict):
    ttl: float
    plan_ate_hoje: float
    finalizado: float
    na: float
    passeds: float
    falha: float
    bloqueado: float
    impactos_dev: float
    impactos_cliente: float
    bugs_total: float
    bugs_fechados: float


class FrenteIndicadores(TypedDict):
    plan_ate_hoje: float
    na: float
    passeds: float
    gap: float
    pct_plan: float
    pct_real: float
    pct_bugs_dev: float
    pct_bugs_cliente: float
    bugs_abertos: float
    status: EvolucaoStatus


def _ratio(num: float, den: float) -> float:
    return num / den if den > 0 else 0


def indicadores_frente(c: FrenteContagens) -> FrenteIndicadores:
    gap = c["plan_ate_hoje"] - c["finalizado"]
    executados = c["passeds"] + c["falha"] + c["bloqueado"]
    return {
        "plan_ate_hoje": c["plan_ate_hoje"],
        "na": c["na"],
        "passeds": c["passeds"],
        "gap": gap,
        "pct_plan": _ratio(c["plan_ate_hoje"], c["ttl"]),
        "pct_real": _ratio(c["finalizado"], c["ttl"]),
        "pct_bugs_dev": _ratio(c["impactos_dev"], executados),
        "pct_bugs_cliente": _ratio(c["impactos_cliente"], executados),
        "bugs_abertos": max(0, c["bugs_total"] - c["bugs_fechados"]),
        "status": status_evolucao(
            gap=gap,
            ttl_cts=c["ttl"],
            finalizados=c["finalizado"],
            na=c["na"],
        ),
    }


def ha_sobreposicao_frentes(nomes: list[str]) -> bool:
    norm = [nome.strip().lower() for nome in nomes if nome.strip()]
    return any(
        i != j and outro.find(nome) >= 0
        for i, nome in enumerate(norm)
        for j, outro in enumerate(norm)
    )
