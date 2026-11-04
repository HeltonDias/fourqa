"""Evolução QA: junta planejamento vigente e execuções do PlanKey."""

from __future__ import annotations

import re
from datetime import date
from typing import Any

from fourqa.domain.evolucao_qa import build_evolucao_qa
from fourqa.persistence.provider import get_stores
from fourqa.services.planning_service import _hoje_local, get_planning_view

_ISO = re.compile(r"^\d{4}-\d{2}-\d{2}$")
MAX_RANGE_DAYS = 400


def _valid_day(value: str | None) -> str | None:
    if not value:
        return None
    text = value.strip()[:10]
    if not _ISO.match(text):
        raise ValueError("Data inválida. Use AAAA-MM-DD.")
    date.fromisoformat(text)
    return text


async def get_evolucao_qa(plan_key: str, start: str | None = None, end: str | None = None) -> dict[str, Any]:
    asked_start, asked_end = _valid_day(start), _valid_day(end)
    view = await get_planning_view(plan_key)
    stores = await get_stores()
    exec_rows = await stores["azure_snapshot"].list_execucoes(plan_key)
    bag = await stores["meta"].get_many(["data_inicio", "data_fim"])
    items = view.get("items") or []
    alloc_days = sorted(d[:10] for i in items for d in (i.get("allocations") or {}))
    as_of = _hoje_local()
    first: str = asked_start or _valid_day(bag.get("data_inicio")) or (alloc_days[0] if alloc_days else as_of)
    last: str = asked_end or _valid_day(bag.get("data_fim")) or (alloc_days[-1] if alloc_days else as_of)
    if last < first:
        raise ValueError("A data final deve ser igual ou posterior à inicial.")
    if (date.fromisoformat(last) - date.fromisoformat(first)).days > MAX_RANGE_DAYS:
        raise ValueError(f"Intervalo máximo de {MAX_RANGE_DAYS} dias.")
    out = build_evolucao_qa(items, exec_rows, first, last, as_of)
    return {"planKey": plan_key, "dimensions": view.get("dimensions") or [], **out}
