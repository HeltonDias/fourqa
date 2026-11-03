"""Agrupamento Report."""

from __future__ import annotations

import json
from typing import TypedDict

from fourqa.domain.dimensions import DetectedDimension
from fourqa.types import ExecucaoRow

SUITE_FALLBACK = "(sem suíte)"


class ReportExecGroup(TypedDict):
    rows: list[ExecucaoRow]
    classificacao: dict[str, str]
    frente: str | None
    processo: str


def _visible_dimensions(dimensoes: list[DetectedDimension]) -> list[DetectedDimension]:
    return [dim for dim in dimensoes if dim.get("visible", True) is not False]


def _parse_dimensions(row: ExecucaoRow) -> dict[str, str]:
    raw = row.get("dimensions_json")
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
        if not isinstance(parsed, dict):
            return {}
        out: dict[str, str] = {}
        for key, value in parsed.items():
            if isinstance(value, str) and value.strip():
                out[key] = value.strip()
        return out
    except json.JSONDecodeError:
        return {}


def _dimension_value(
    row: ExecucaoRow,
    dim: DetectedDimension,
    parsed: dict[str, str],
) -> str:
    from_json = (parsed.get(dim["key"]) or "").strip()
    if from_json:
        return from_json
    role = dim.get("role")
    if role == "front":
        return (row.get("frente") or "").strip()
    if role == "process":
        return (row.get("processo") or row.get("suite_name") or "").strip()
    return ""


def group_execucoes_for_report(
    exec_rows: list[ExecucaoRow],
    dimensoes: list[DetectedDimension],
) -> list[ReportExecGroup]:
    visible = _visible_dimensions(dimensoes)
    process_dim = next((dim for dim in visible if dim.get("role") == "process"), None)
    front_dim = next((dim for dim in visible if dim.get("role") == "front"), None)
    groups: dict[str, ReportExecGroup] = {}

    for row in exec_rows:
        parsed = _parse_dimensions(row)
        if not process_dim:
            processo = (row.get("suite_name") or "").strip() or SUITE_FALLBACK
            key = f"suite:{processo.lower()}"
            found = groups.get(key)
            if found:
                found["rows"].append(row)
                continue
            classificacao = parsed
            if not classificacao and visible and (row.get("frente") or "").strip():
                classificacao = {visible[0]["key"]: row["frente"].strip()}  # type: ignore[index]
            groups[key] = {
                "rows": [row],
                "classificacao": classificacao,
                "frente": row.get("frente"),
                "processo": processo,
            }
            continue

        classificacao: dict[str, str] = {}
        parts: list[str] = []
        for dim in visible:
            value = _dimension_value(row, dim, parsed)
            if value:
                classificacao[dim["key"]] = value
            parts.append(f"{dim['key']}={value}")
        key = "\u001f".join(parts)
        found = groups.get(key)
        if found:
            found["rows"].append(row)
            continue
        processo = (
            classificacao.get(process_dim["key"])
            or (row.get("suite_name") or "").strip()
            or SUITE_FALLBACK
        )
        front_value = classificacao.get(front_dim["key"]) if front_dim else None
        groups[key] = {
            "rows": [row],
            "classificacao": classificacao,
            "frente": front_value or row.get("frente"),
            "processo": processo,
        }

    return list(groups.values())
