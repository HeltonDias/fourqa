#!/usr/bin/env python3
"""Valida fourqa.domain.formulas contra backend/shared/formulas-parity-vectors.json."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend" / "src"))

from fourqa.domain import formulas as f  # noqa: E402

VECTORS = json.loads(
    (ROOT / "backend" / "shared" / "formulas-parity-vectors.json").read_text(encoding="utf-8")
)


def assert_eq(actual, expected, label: str) -> None:
    if json.dumps(actual, sort_keys=True) != json.dumps(expected, sort_keys=True):
        raise AssertionError(f"{label}: expected {expected!r} got {actual!r}")


def main() -> None:
    for c in VECTORS["estadoPonto"]:
        actual = f.estado_ponto({"outcome": c["outcome"], "test_point_state": c["test_point_state"]})
        assert_eq(actual, c["expected"], "estadoPonto")

    for c in VECTORS["classifyExecution"]:
        actual = f.classify_execution(
            {
                "outcome": c["outcome"],
                "test_case_state": c["test_case_state"],
                "test_point_state": c["test_point_state"],
            }
        )
        assert_eq(actual, c["expected"], "classifyExecution")

    assert_eq(
        f.count_execucoes(VECTORS["countExecucoes"]["rows"], VECTORS["countExecucoes"]["filter"]),
        VECTORS["countExecucoes"]["expected"],
        "countExecucoes",
    )

    assert_eq(
        f.metricas_por_processo(
            VECTORS["metricasPorProcesso"]["rows"],
            VECTORS["metricasPorProcesso"]["planKey"],
            VECTORS["metricasPorProcesso"]["processo"],
        ),
        VECTORS["metricasPorProcesso"]["expected"],
        "metricasPorProcesso",
    )

    assert_eq(
        f.metricas_por_processo(
            VECTORS["metricasPorProcessoEmpty"]["rows"],
            VECTORS["metricasPorProcessoEmpty"]["planKey"],
            VECTORS["metricasPorProcessoEmpty"]["processo"],
        ),
        VECTORS["metricasPorProcessoEmpty"]["expected"],
        "metricasPorProcessoEmpty",
    )

    assert_eq(
        f.total_realizado_linha(VECTORS["totalRealizadoLinha"]["metrics"]),
        VECTORS["totalRealizadoLinha"]["expected"],
        "totalRealizadoLinha",
    )

    assert_eq(
        f.finalizados_com_cancelados(
            VECTORS["finalizadosComCancelados"]["metrics"],
            VECTORS["finalizadosComCancelados"]["cancelados"],
        ),
        VECTORS["finalizadosComCancelados"]["expected"],
        "finalizadosComCancelados",
    )

    assert_eq(
        f.impacto_total_test_point(
            VECTORS["impactoTotalTestPoint"]["rows"],
            VECTORS["impactoTotalTestPoint"]["planKey"],
        ),
        VECTORS["impactoTotalTestPoint"]["expected"],
        "impactoTotalTestPoint",
    )

    assert_eq(
        f.classificar_impactos_kpi(
            VECTORS["classificarImpactosKpi"]["execRows"],
            VECTORS["classificarImpactosKpi"]["falhaRows"],
            VECTORS["classificarImpactosKpi"]["planKey"],
        ),
        VECTORS["classificarImpactosKpi"]["expected"],
        "classificarImpactosKpi",
    )

    assert_eq(
        f.count_falhas(VECTORS["countFalhas"]["rows"], VECTORS["countFalhas"]["filter"]),
        VECTORS["countFalhas"]["expected"],
        "countFalhas",
    )

    assert_eq(
        f.sumif_frente(
            VECTORS["sumifFrente"]["rows"],
            VECTORS["sumifFrente"]["needle"],
            VECTORS["sumifFrente"]["field"],
        ),
        VECTORS["sumifFrente"]["expected"],
        "sumifFrente",
    )

    print("formulas-parity (Python): OK")


if __name__ == "__main__":
    main()
