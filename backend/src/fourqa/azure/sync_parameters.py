"""Sync parameters UI (mirrors syncParameters.ts)."""

from __future__ import annotations

import json
from typing import Any

from fourqa.azure.util import normalize

SYNC_PARAMETERS_KEY = "sync_parameters"

EXECUTION_FIELD_CATALOG = [
    "PlanKey", "PlanId", "PlanName", "Frente", "Atalho", "SuiteId", "SuiteName", "TestPointId", "TestCaseId",
    "TestCaseTitle", "Prioridade", "Responsabilidade", "TestCaseState", "TestPointState", "Outcome",
    "DateCompleted", "RunBy", "LastUpdatedDate", "LastTestRunId", "LastResultId", "TestCaseLink", "TestCaseTags",
]
FAILURE_FIELD_CATALOG = [
    "PlanKey", "Responsavel", "Ambiente", "Categoria", "ID", "Impacto", "Frente", "Título", "Status",
    "Criada por", "Criação", "Fechada por", "Fechamento", "Links", "Tags",
]


def decode_stored_parameters(raw: str | None) -> dict[str, Any]:
    if not raw or not raw.strip():
        return {"draft": None, "warning": None}
    try:
        return {"draft": parse_sync_parameters(json.loads(raw)), "warning": None}
    except (json.JSONDecodeError, ValueError):
        return {"draft": None, "warning": "A configuração gravada está inválida. O ambiente voltou a valer."}


def parse_sync_parameters(body: object) -> dict[str, Any]:
    if not isinstance(body, dict):
        raise ValueError("Informe os parâmetros.")
    raw = body
    kpi = _text(raw.get("kpiPlanKey"), "O PlanKey dos KPIs", 80)
    hierarchy = raw.get("hierarchy")
    if not isinstance(hierarchy, list):
        raise ValueError("Informe a hierarquia.")
    responsibilities = raw.get("responsibilities")
    if not isinstance(responsibilities, list):
        raise ValueError("Informe as categorias.")
    return {
        "kpiPlanKey": kpi,
        "hierarchy": hierarchy,
        "responsibilities": responsibilities,
        "executionFields": _fields(raw.get("executionFields"), "execuções", EXECUTION_FIELD_CATALOG),
        "failureFields": _fields(raw.get("failureFields"), "falhas", FAILURE_FIELD_CATALOG),
    }


def _text(value: object, label: str, max_len: int) -> str:
    if not isinstance(value, str):
        raise ValueError(f"{label} precisa ser texto.")
    trimmed = value.strip()
    if not trimmed:
        raise ValueError(f"{label} não pode ficar vazio.")
    if len(trimmed) > max_len:
        raise ValueError(f"{label} aceita no máximo {max_len} caracteres.")
    return trimmed


def _fields(value: object, label: str, catalog: list[str]) -> list[str]:
    if not isinstance(value, list) or not value:
        raise ValueError(f"Selecione ao menos um campo de {label}.")
    allowed = set(catalog)
    chosen: list[str] = []
    for item in value:
        if not isinstance(item, str) or item not in allowed:
            raise ValueError(f"Campo de {label} desconhecido.")
        if item not in chosen:
            chosen.append(item)
    return [name for name in catalog if name in chosen]


def parameters_to_override(draft: dict[str, Any]) -> dict[str, Any]:
    responsibilities = {normalize(row["category"]): row["responsibility"] for row in draft.get("responsibilities") or [] if isinstance(row, dict)}
    hierarchy = []
    for row in draft.get("hierarchy") or []:
        if not isinstance(row, dict):
            continue
        hierarchy.append(
            {
                "order": row.get("order"),
                "columnName": row.get("columnName"),
                "sourceLevel": row.get("sourceLevel"),
                "active": row.get("active") is True,
                "planKey": row.get("planKey") or None,
                "sourceType": "current_suite" if row.get("source") == "current_suite" else "hierarchy_level",
            }
        )
    return {"kpiPlanKey": draft["kpiPlanKey"], "hierarchy": hierarchy, "responsibilities": responsibilities}


def present_parameters(env_view: dict[str, object], stored: dict[str, Any] | None, warning: str | None) -> dict[str, object]:
    base = {"executionCatalog": list(EXECUTION_FIELD_CATALOG), "failureCatalog": list(FAILURE_FIELD_CATALOG)}
    if not stored:
        return {
            **env_view,
            **base,
            "source": "environment",
            "warning": warning or env_view.get("warning"),
        }
    return {
        **env_view,
        "kpiPlanKey": stored.get("kpiPlanKey"),
        "hierarchy": stored.get("hierarchy"),
        "responsibilities": stored.get("responsibilities"),
        "executionFields": stored.get("executionFields"),
        "failureFields": stored.get("failureFields"),
        **base,
        "source": "saved",
        "warning": warning,
    }
