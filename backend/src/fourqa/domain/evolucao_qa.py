"""Evolução por QA (DEC-037): planejado por responsável; realizado só em suíte de dono único."""

from __future__ import annotations

import re
from collections.abc import Iterable, Mapping
from datetime import date, timedelta
from typing import Any

from fourqa.domain.evolucao_status import status_evolucao
from fourqa.domain.formulas import classify_execution

UNATTRIBUTED_KEY = "__nao_atribuivel__"
_SPLIT = re.compile(r"[,;/&+]|\s+e\s+", re.IGNORECASE)
_DAY = re.compile(r"^(\d{4}-\d{2}-\d{2})")


def owner_of(responsavel: str | None) -> tuple[str | None, str | None]:
    """(dono, motivo). Sem responsável ou com vários nomes a suíte não é atribuível."""
    text = (responsavel or "").strip()
    if not text:
        return None, "sem_responsavel"
    parts = [p.strip() for p in _SPLIT.split(text) if p.strip()]
    if len(parts) != 1:
        return None, "compartilhada"
    return parts[0], None


def _day(value: Any) -> str | None:
    if not value:
        return None
    m = _DAY.match(str(value).strip())
    return m.group(1) if m else None


def _days(start: str, end: str) -> list[str]:
    a, b = date.fromisoformat(start), date.fromisoformat(end)
    out: list[str] = []
    while a <= b:
        out.append(a.isoformat())
        a += timedelta(days=1)
    return out


def _item_key(item: Mapping[str, Any]) -> str | None:
    if item.get("suiteId") is not None:
        return f"s:{item['suiteId']}"
    if item.get("testPointId") is not None:
        return f"p:{item['testPointId']}"
    return None


def _row_key(row: Mapping[str, Any]) -> str | None:
    if row.get("suite_id") is not None:
        return f"s:{row['suite_id']}"
    if row.get("test_point_id") is not None:
        return f"p:{row['test_point_id']}"
    return None


def _empty_bucket(key: str, name: str, attributable: bool) -> dict[str, Any]:
    return {
        "key": key,
        "name": name,
        "attributable": attributable,
        "suites": [],
        "baseline": 0.0,
        "planned": 0.0,
        "plannedToDate": 0.0,
        "finalized": 0.0,
        "executed": 0.0,
        "passed": 0.0,
        "na": 0.0,
        "failed": 0.0,
        "blocked": 0.0,
        "released": 0.0,
        "design": 0.0,
        "notReleased": 0.0,
        "finalizedInRange": 0.0,
        "reasons": {"sem_responsavel": 0, "compartilhada": 0},
        "_planned_by_day": {},
        "_finalized_by_day": {},
        "_executed_by_day": {},
    }


def _finish(bucket: dict[str, Any], days: list[str], as_of: str) -> dict[str, Any]:
    planned_by_day = bucket.pop("_planned_by_day")
    finalized_by_day = bucket.pop("_finalized_by_day")
    executed_by_day = bucket.pop("_executed_by_day")
    series = []
    acc_plan = acc_fin = 0.0
    for d in days:
        acc_plan += planned_by_day.get(d, 0.0)
        acc_fin += finalized_by_day.get(d, 0.0)
        series.append(
            {
                "date": d,
                "planned": planned_by_day.get(d, 0.0),
                "finalized": finalized_by_day.get(d, 0.0),
                "executed": executed_by_day.get(d, 0.0),
                "plannedCumulative": acc_plan,
                "finalizedCumulative": acc_fin if d <= as_of else None,
            }
        )
    gap = bucket["plannedToDate"] - bucket["finalizedInRange"]
    bucket["gap"] = gap
    bucket["status"] = (
        status_evolucao(gap=gap, ttl_cts=bucket["baseline"], finalizados=bucket["finalized"], na=bucket["na"])
        if bucket["attributable"]
        else None
    )
    bucket["suiteCount"] = len(bucket["suites"])
    bucket["daily"] = series
    return bucket


def build_evolucao_qa(
    items: Iterable[Mapping[str, Any]],
    exec_rows: Iterable[Mapping[str, Any]],
    start: str,
    end: str,
    as_of: str,
) -> dict[str, Any]:
    days = _days(start, end) if start <= end else []
    cutoff = min(as_of, end)
    buckets: dict[str, dict[str, Any]] = {}
    owner_by_key: dict[str, str] = {}

    def bucket_for(owner: str | None) -> dict[str, Any]:
        if owner is None:
            return buckets.setdefault(UNATTRIBUTED_KEY, _empty_bucket(UNATTRIBUTED_KEY, "Não atribuível", False))
        key = owner.lower()
        return buckets.setdefault(key, _empty_bucket(key, owner, True))

    for item in items:
        owner, reason = owner_of(item.get("responsavel"))
        bucket = bucket_for(owner)
        if reason:
            bucket["reasons"][reason] += 1
        key = _item_key(item)
        if key:
            owner_by_key[key] = bucket["key"]
        bucket["suites"].append(
            {
                "suiteId": item.get("suiteId"),
                "testPointId": item.get("testPointId"),
                "suiteName": item.get("suiteName"),
                "responsavel": item.get("responsavel"),
                "dimensions": item.get("dimensions") or {},
            }
        )
        bucket["baseline"] += float(item.get("baselineCount") or 0)
        for metric in ("passed", "na", "failed", "blocked", "released", "design", "notReleased"):
            bucket[metric] += float(item.get(metric) or 0)
        for raw_day, qty in (item.get("allocations") or {}).items():
            d = _day(raw_day)
            if not d or d < start or d > end:
                continue
            q = float(qty or 0)
            bucket["planned"] += q
            bucket["_planned_by_day"][d] = bucket["_planned_by_day"].get(d, 0.0) + q
            if d <= cutoff:
                bucket["plannedToDate"] += q

    for row in exec_rows:
        key = _row_key(row)
        bucket_key = owner_by_key.get(key or "")
        if bucket_key is None:
            continue
        status = classify_execution(row)
        if status not in ("passed", "na", "falhado"):
            continue
        d = _day(row.get("date_completed")) or _day(row.get("last_updated_date"))
        if not d or d < start or d > cutoff:
            continue
        bucket = buckets[bucket_key]
        bucket["_executed_by_day"][d] = bucket["_executed_by_day"].get(d, 0.0) + 1
        if status in ("passed", "na"):
            bucket["finalizedInRange"] += 1
            bucket["_finalized_by_day"][d] = bucket["_finalized_by_day"].get(d, 0.0) + 1

    for bucket in buckets.values():
        bucket["finalized"] = bucket["passed"] + bucket["na"]
        bucket["executed"] = bucket["passed"] + bucket["na"] + bucket["failed"]

    finished = [_finish(b, days, as_of) for b in buckets.values()]
    qas = sorted((b for b in finished if b["attributable"]), key=lambda b: b["name"].lower())
    unattributed = next((b for b in finished if not b["attributable"]), None)
    return {
        "range": {"from": start, "to": end, "asOf": as_of},
        "qas": qas,
        "unattributed": unattributed,
    }
