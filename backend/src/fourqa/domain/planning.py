"""Planejamento domain."""

from __future__ import annotations

import re
from collections.abc import Callable, Mapping, Sequence
from datetime import datetime, timedelta
from typing import Any, Literal, TypedDict, TypeVar

from fourqa.domain.formulas import StatusCenario, classify_execution
from fourqa.domain.plan_period import PLAN_PERIOD_MAX_DAYS, calendar_day_span_inclusive, parse_calendar_day

SUITE_FILL_MAX_LENGTH = 80

PointIntegrity = Literal["consistent", "inconsistent", "unmapped"]
T = TypeVar("T")
Row = TypeVar("Row", bound=Mapping[str, Any])


class ScopeRef(TypedDict, total=False):
    plan_id: int | None
    suite_id: int | None
    test_point_id: int | None
    test_case_id: int | None
    label: str | None


class ScheduleDraft(TypedDict):
    suite_id: int | None
    test_point_id: int | None
    test_case_id: int | None
    suite_name: str | None
    planned_start: str | None
    planned_end: str | None
    responsavel: str | None
    prioridade: str | None
    baseline_quantity: int
    allocations: list[dict[str, Any]]


class PlanningRevision(TypedDict):
    version: int
    created_at: str
    reason: str
    baseline_origin: Literal["legacy", "motor"]
    scope_snapshot_available: bool
    scope: list[ScopeRef]


def scope_group_key(item: Mapping[str, Any], index: int) -> str:
    if item.get("suite_id") is not None:
        return f"suite:{item['suite_id']}"
    if item.get("test_point_id") is not None:
        return f"point:{item['test_point_id']}"
    return f"loose:{index}"


def lone_loose_fill(previous: Sequence[T], next_groups: int) -> T | None:
    return previous[0] if len(previous) == 1 and next_groups == 1 else None


def previous_fill_key(item: Mapping[str, Any]) -> str | None:
    if item.get("suite_id") is not None:
        return f"suite:{item['suite_id']}"
    if item.get("test_point_id") is not None:
        return f"point:{item['test_point_id']}"
    return None


def normalize_suite_fill(value: str | None) -> str | None:
    if value is None:
        return None
    trimmed = value.strip()
    if not trimmed:
        return None
    if len(trimmed) > SUITE_FILL_MAX_LENGTH:
        raise ValueError("Responsável e prioridade aceitam no máximo 80 caracteres.")
    return trimmed


def schedule_items_for_scope(
    *,
    scope: Sequence[Mapping[str, Any]],
    suite_names: Mapping[int | None, str | None],
    previous: Sequence[Mapping[str, Any]],
    inherited: Callable[[str], Mapping[str, str | None] | None] | None = None,
) -> list[ScheduleDraft]:
    groups: dict[str, dict[str, Any]] = {}
    for index, item in enumerate(scope):
        key = scope_group_key(item, index)
        found = groups.get(key)
        if found:
            found["count"] = int(found["count"]) + 1  # type: ignore[operator]
            continue
        with_suite = item.get("suite_id") is not None
        groups[key] = {
            "suite_id": item.get("suite_id"),
            "test_point_id": None if with_suite else item.get("test_point_id"),
            "test_case_id": None if with_suite else item.get("test_case_id"),
            "count": 1,
        }
    prev_map: dict[str, Mapping[str, Any]] = {}
    loose_previous: list[Mapping[str, Any]] = []
    for item in previous:
        key = previous_fill_key(item)  # type: ignore[arg-type]
        if key:
            prev_map[key] = item
        else:
            loose_previous.append(item)
    loose_groups = [g for g in groups.values() if previous_fill_key(g) is None]  # type: ignore[arg-type]
    lone_loose = lone_loose_fill(loose_previous, len(loose_groups))
    out: list[ScheduleDraft] = []
    for group in groups.values():
        key = previous_fill_key(group)  # type: ignore[arg-type]
        kept = prev_map.get(key) if key else lone_loose  # type: ignore[arg-type]
        suite_id = group.get("suite_id")
        suite_name = suite_names.get(suite_id) if isinstance(suite_id, int) else None  # type: ignore[arg-type]
        inherited_dates = None
        if inherited and suite_name:
            inherited_dates = inherited(suite_name)
        out.append(
            {
                "suite_id": group.get("suite_id"),  # type: ignore[dict-item]
                "test_point_id": group.get("test_point_id"),  # type: ignore[dict-item]
                "test_case_id": group.get("test_case_id"),  # type: ignore[dict-item]
                "suite_name": suite_name,
                "planned_start": (kept or {}).get("planned_start") if kept else None,  # type: ignore[union-attr]
                "planned_end": (kept or {}).get("planned_end") if kept else None,  # type: ignore[union-attr]
                "responsavel": (kept or {}).get("responsavel") if kept and group.get("suite_id") else None,  # type: ignore[union-attr]
                "prioridade": (kept or {}).get("prioridade") if kept and group.get("suite_id") else None,  # type: ignore[union-attr]
                "baseline_quantity": int(group["count"]),  # type: ignore[arg-type]
                "allocations": [
                    {"date": a["date"], "quantity": a["quantity"]}
                    for a in ((kept or {}).get("allocations") or [])  # type: ignore[union-attr]
                ],
            }
        )
        if inherited_dates:
            if not out[-1]["planned_start"]:
                out[-1]["planned_start"] = inherited_dates.get("start")
            if not out[-1]["planned_end"]:
                out[-1]["planned_end"] = inherited_dates.get("end")
    return out


def match_schedule_item(items: Sequence[Row], input_row: Mapping[str, Any]) -> Row | None:
    suite_id = input_row.get("suite_id")
    test_point_id = input_row.get("test_point_id")
    if suite_id is not None:
        for row in items:
            if row.get("suite_id") == suite_id:
                return row
        return None
    if test_point_id is not None:
        for row in items:
            if row.get("suite_id") is None and row.get("test_point_id") == test_point_id:
                return row
        return None
    loose = [row for row in items if row.get("suite_id") is None and row.get("test_point_id") is None]
    return loose[0] if len(loose) == 1 else None


def scope_identity(ref: Mapping[str, Any]) -> str:
    return f"{ref.get('plan_id') or ''}|{ref.get('suite_id') or ''}|{ref.get('test_point_id') or ''}|{ref.get('test_case_id') or ''}"


def diff_scope(baseline: Sequence[Mapping[str, Any]], source: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    base = {scope_identity(item): item for item in baseline}
    current = {scope_identity(item): item for item in source}
    added_items = [current[k] for k in current if k not in base]
    removed_items = [base[k] for k in base if k not in current]

    def suite_ids(items: Sequence[Mapping[str, Any]]) -> set[int]:
        return {i["suite_id"] for i in items if i.get("suite_id") is not None}  # type: ignore[misc]

    base_suites = suite_ids(baseline)
    source_suites = suite_ids(source)
    return {
        "baseline_count": len(baseline),
        "source_count": len(source),
        "added_count": len(added_items),
        "removed_count": len(removed_items),
        "scope_delta": len(added_items) - len(removed_items),
        "added_items": added_items,
        "removed_items": removed_items,
        "added_suites": len([s for s in source_suites if s not in base_suites]),
        "removed_suites": len([s for s in base_suites if s not in source_suites]),
    }


def calendar_date(value: str | None) -> str | None:
    if not value:
        return None
    head = re.match(r"^(\d{4}-\d{2}-\d{2})", value.strip())
    if head:
        return parse_calendar_day(head.group(1))
    return parse_calendar_day(value.strip())


def schedule_of(
    *,
    baseline_count: int,
    allocations: list[dict[str, Any]],
    as_of: str,
    finalized_count: int,
) -> dict[str, int | float]:
    distributed_count = sum(int(row.get("planned_quantity") or 0) for row in allocations)
    as_of_day = calendar_date(as_of) or as_of
    planned_to_date = 0
    for row in allocations:
        day = calendar_date(str(row.get("date", "")))
        if day and day <= as_of_day:
            planned_to_date += int(row.get("planned_quantity") or 0)
    schedule_delta = finalized_count - planned_to_date
    return {
        "baseline_count": baseline_count,
        "distributed_count": distributed_count,
        "distribution_gap": distributed_count - baseline_count,
        "planned_to_date": planned_to_date,
        "finalized_count": finalized_count,
        "schedule_delta": schedule_delta,
        "backlog": max(planned_to_date - finalized_count, 0),
        "ahead_of_plan": max(finalized_count - planned_to_date, 0),
    }


def dates_between(start: str | None, end: str | None) -> list[str]:
    a = calendar_date(start)
    b = calendar_date(end)
    if not a or not b or a > b:
        return []
    if calendar_day_span_inclusive(a, b) > PLAN_PERIOD_MAX_DAYS:
        return []
    out: list[str] = []
    cursor = datetime.strptime(a, "%Y-%m-%d")
    last = datetime.strptime(b, "%Y-%m-%d")
    while cursor <= last:
        out.append(cursor.strftime("%Y-%m-%d"))
        cursor += timedelta(days=1)
    return out


def _norm(value: str | None) -> str:
    return (value or "").strip().lower()


def assess_point(point: Mapping[str, Any]) -> dict[str, StatusCenario | Literal["unclassified"] | PointIntegrity]:
    outcome = _norm(point.get("outcome"))
    test_case = _norm(point.get("test_case_state"))
    classification = classify_execution(point)  # type: ignore[arg-type]
    if outcome == "passed" and test_case == "bug":
        return {"classification": classification, "integrity": "inconsistent"}
    known_outcome = outcome in ("passed", "failed", "blocked", "notapplicable")
    known_case = test_case in ("design", "não atribuído", "nao atribuido")
    ready = _norm(point.get("test_point_state")) == "ready" and not known_outcome
    if known_outcome or known_case or ready:
        return {"classification": classification, "integrity": "consistent"}
    return {"classification": "unclassified", "integrity": "unmapped"}


def count_assessments(points: Sequence[Mapping[str, Any]]) -> dict[str, int]:
    rows = [assess_point(p) for p in points]
    return {
        "classified_count": sum(1 for row in rows if row["classification"] != "unclassified"),
        "unclassified_count": sum(1 for row in rows if row["integrity"] == "unmapped"),
        "inconsistent_count": sum(1 for row in rows if row["integrity"] == "inconsistent"),
        "finalized_count": sum(
            1 for row in rows if row["classification"] in ("passed", "na")
        ),
    }


def scope_integrity_message(*, scope_snapshot_available: bool, added_count: int, removed_count: int) -> str | None:
    if not scope_snapshot_available:
        return (
            "Baseline legado sem snapshot dos CTs. Não há informação suficiente para validar o que entrou ou saiu."
        )
    if added_count == 0 and removed_count == 0:
        return None
    parts: list[str] = []
    if added_count == 1:
        parts.append("1 CT foi adicionado após a confirmação do baseline")
    elif added_count > 1:
        parts.append(f"{added_count} CTs foram adicionados após a confirmação do baseline")
    if removed_count == 1:
        parts.append("1 CT foi removido da fonte")
    elif removed_count > 1:
        parts.append(f"{removed_count} CTs foram removidos da fonte")
    return ". ".join(parts) + "."


def _count_text(value: float) -> str:
    return str(int(value)) if float(value).is_integer() else str(value)


def schedule_integrity_message(baseline_count: float, distributed_count: float) -> str | None:
    gap = distributed_count - baseline_count
    if gap == 0:
        return None
    if gap < 0:
        suffix = "" if gap == -1 else "s"
        return f"{_count_text(-gap)} cenário{suffix} ainda não distribuído{suffix} no cronograma"
    suffix = "" if gap == 1 else "s"
    return f"{_count_text(gap)} cenário{suffix} distribuído{suffix} além do baseline"


def classification_integrity_message(unclassified: int, inconsistent: int) -> str | None:
    parts: list[str] = []
    if unclassified > 0:
        suffix = "" if unclassified == 1 else "s"
        parts.append(f"{unclassified} cenário{suffix} não classificado{suffix}")
    if inconsistent > 0:
        parts.append(f"{inconsistent} combinação inconsistente")
    return ". ".join(parts) + "." if parts else None


def next_revision(
    previous: PlanningRevision | None,
    *,
    at: str,
    reason: str,
    scope: Sequence[ScopeRef],
    adopt_source: bool,
) -> dict[str, PlanningRevision | None]:
    if previous and not adopt_source:
        scope_copy = [item.copy() for item in previous["scope"]]
    else:
        scope_copy = [item.copy() for item in scope]
    current: PlanningRevision = {
        "version": (previous["version"] if previous else 0) + 1,
        "created_at": at,
        "reason": reason.strip(),
        "baseline_origin": "motor",
        "scope_snapshot_available": True,
        "scope": scope_copy,
    }
    return {"previous": previous, "current": current}
