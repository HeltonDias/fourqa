"""Planning service."""

from __future__ import annotations

import json
from collections.abc import Iterable, Mapping, Sequence
from datetime import datetime, timezone
from typing import Any

from fourqa.domain.legacy_plan_owner import is_legacy_plan_owner
from fourqa.domain.plan_period import assert_stored_planning_period
from fourqa.domain.planning import (
    assess_point,
    calendar_date,
    classification_integrity_message,
    dates_between,
    diff_scope,
    match_schedule_item,
    normalize_suite_fill,
    previous_fill_key,
    schedule_integrity_message,
    schedule_items_for_scope,
    schedule_of,
    scope_integrity_message,
)
from fourqa.domain.dimensions import DetectedDimension, infer_dimensions
from fourqa.domain.formulas import classify_execution, metricas_dos_pontos
from fourqa.domain.distribute import (
    DISTRIBUTION_ASSIGNMENT,
    apportion_distribution,
    count_planning_balance,
    distribution_days,
    is_distribution_strategy,
    quantity_outside_days,
    shift_calendar_day,
    trim_allocations_to_keep,
)
from fourqa.persistence.contracts import LegacyPlanRow, PlanningItemWrite, PlanningScopeWrite
from fourqa.persistence.planning_conflict import PlanningConflictError
from fourqa.persistence.provider import get_stores
from fourqa.persistence.schedule_fingerprint import schedule_fingerprint
from fourqa.types import ExecucaoRow


async def _stores():
    return await get_stores()


def _utc_stamp() -> str:
    return datetime.now(timezone.utc).replace(tzinfo=None).isoformat() + "Z"


def _hoje_local() -> str:
    now = datetime.now()
    return f"{now.year:04d}-{now.month:02d}-{now.day:02d}"


async def _load_meta(keys: list[str]) -> dict[str, str | None]:
    stores = await _stores()
    return await stores["meta"].get_many(keys)


def _meta(bag: dict[str, str | None], key: str) -> str | None:
    return bag.get(key)


async def _legacy_base(plan_key: str, bag: dict[str, str | None] | None = None) -> list[LegacyPlanRow]:
    stores = await _stores()
    owner = _meta(bag, "planejamento_legado_plan_key") if bag else await stores["meta"].get("planejamento_legado_plan_key")
    if not is_legacy_plan_owner(plan_key, owner):
        return []
    rows = await stores["legacy_plan"].list_base()
    return [r for r in rows if not __import__("re").search(r"valores\s+totais", str(r.get("processo") or ""), __import__("re").I)]


def _dims_of(row: Mapping[str, Any]) -> dict[str, str]:
    raw = row.get("dimensions_json")
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
        return {k: v.strip() for k, v in parsed.items() if isinstance(v, str) and v.strip()}
    except json.JSONDecodeError:
        return {}


def _catalog(plan_key: str, rows: Sequence[ExecucaoRow], bag: dict[str, str | None]) -> list[DetectedDimension]:
    raw = _meta(bag, f"dimensoes_catalog:{plan_key}")
    if raw:
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, list) and parsed:
                return [d for d in parsed if d.get("visible") is not False]
        except json.JSONDecodeError:
            pass
    return infer_dimensions(rows)


def _scope_note(origin: str, snapshot: bool, added: int, removed: int) -> str | None:
    if origin == "ausente":
        return "Planejamento ainda não confirmado. A fonte atual é sugestão e não entra no baseline."
    return scope_integrity_message(scope_snapshot_available=snapshot, added_count=added, removed_count=removed)


def _scope_of_group(sample: Mapping[str, Any] | None, scope: Sequence[Mapping[str, Any]]) -> list[Mapping[str, Any]]:
    if not sample:
        return []
    if sample.get("suite_id") is not None:
        return [s for s in scope if s.get("suite_id") == sample.get("suite_id")]
    if sample.get("test_point_id") is not None:
        return [s for s in scope if s.get("suite_id") is None and s.get("test_point_id") == sample.get("test_point_id")]
    return []


async def get_planning_view(plan_key: str, version: int | None = None) -> dict[str, Any]:
    bag = await _load_meta(["data_inicio", "data_fim", "planejamento_legado_plan_key", f"dimensoes_catalog:{plan_key}"])
    assert_stored_planning_period(_meta(bag, "data_inicio"), _meta(bag, "data_fim"))
    stores = await _stores()
    planning = stores["planning"]
    exec_rows = await stores["azure_snapshot"].list_execucoes(plan_key)
    as_of = _hoje_local()
    revision = (
        await planning.revision_by_version(plan_key, version)
        if version is not None
        else await planning.latest_revision(plan_key)
    )
    editable = version is None
    snapshot = bool(revision and revision.get("scope_snapshot") == 1)
    baseline_scope = await planning.load_scope(revision["id"]) if revision and snapshot else []
    source_scope: list[PlanningScopeWrite] = [
        {
            "plan_id": r.get("plan_id"),
            "suite_id": r.get("suite_id"),
            "test_point_id": r.get("test_point_id"),
            "test_case_id": r.get("test_case_id"),
            "label": r.get("test_case_title"),
        }
        for r in exec_rows
        if r.get("test_point_id") is not None
    ]
    diff = (
        diff_scope(baseline_scope, source_scope)
        if snapshot
        else {
            "baseline_count": 0,
            "source_count": len(source_scope),
            "added_count": 0,
            "removed_count": 0,
            "scope_delta": 0,
            "added_items": [],
            "removed_items": [],
            "added_suites": 0,
            "removed_suites": 0,
        }
    )
    legacy_rows = await _legacy_base(plan_key, bag)
    legacy = {(r.get("processo") or "").strip().lower(): r for r in legacy_rows}
    groups: dict[str, list[ExecucaoRow]] = {}
    for index, row in enumerate(exec_rows):
        key = previous_fill_key({"suite_id": row.get("suite_id"), "test_point_id": row.get("test_point_id") if row.get("suite_id") is None else None}) or f"loose:{index}"
        groups.setdefault(key, []).append(row)
    alloc_by_suite: dict[str, dict[str, float]] = {}
    period_by_suite: dict[str, dict[str, Any]] = {}
    if revision:
        for item in await planning.load_schedule(revision["id"]):
            key = previous_fill_key({"suite_id": item.get("suite_id"), "test_point_id": item.get("test_point_id")}) or f"loose:{item['id']}"
            period_by_suite[key] = {
                "start": item.get("planned_start"),
                "end": item.get("planned_end"),
                "qty": item.get("baseline_quantity"),
                "name": item.get("suite_name"),
                "responsavel": item.get("responsavel") if item.get("suite_id") is not None else None,
                "prioridade": item.get("prioridade") if item.get("suite_id") is not None else None,
            }
            alloc_by_suite[key] = {a["date"]: a["quantity"] for a in item.get("allocations") or []}
    if not snapshot and legacy_rows:
        return _legacy_planning_view(plan_key, as_of, legacy_rows, exec_rows, len(source_scope))
    items: list[dict[str, Any]] = []
    classified = unclassified = inconsistent = 0
    for key, rows in groups.items():
        sample = rows[0]
        name = (sample.get("suite_name") or "").strip()
        legacy_row = legacy.get(name.lower())
        period = period_by_suite.get(key)
        points = [assess_point(r) for r in rows]
        classified += sum(1 for p in points if p.get("classification") != "unclassified")
        unclassified += sum(1 for p in points if p.get("integrity") == "unmapped")
        inconsistent += sum(1 for p in points if p.get("integrity") == "inconsistent")
        metrics = metricas_dos_pontos(rows)
        finalized = metrics["cts_passeds"] + metrics["cts_na"] + (float(legacy_row.get("cts_cancelados") or 0) if legacy_row else 0)
        suite_scope = _scope_of_group(sample, baseline_scope)
        suite_source = _scope_of_group(sample, source_scope)
        suite_diff = diff_scope(suite_scope, suite_source) if snapshot else None
        baseline_count = len(suite_scope) if snapshot else (float(legacy_row.get("qtd_cts_plan") or 0) if legacy_row else None)
        allocations = alloc_by_suite.get(key, {})
        math = schedule_of(
            baseline_count=int(baseline_count or 0),
            allocations=[{"date": d, "planned_quantity": q} for d, q in allocations.items()],
            as_of=as_of,
            finalized_count=int(finalized),
        )
        items.append(
            {
                "suiteId": sample.get("suite_id"),
                "testPointId": None if sample.get("suite_id") is not None else sample.get("test_point_id"),
                "suiteName": name or "(sem suíte)",
                "responsavel": period.get("responsavel") if period and sample.get("suite_id") is not None else None,
                "prioridade": period.get("prioridade") if period and sample.get("suite_id") is not None else None,
                "dimensions": _dims_of(sample),
                "plannedStart": calendar_date((period or {}).get("start") or (legacy_row or {}).get("data_inicio")),
                "plannedEnd": calendar_date((period or {}).get("end") or (legacy_row or {}).get("data_fim")),
                "baselineCount": baseline_count,
                "sourceCount": len(rows),
                "addedCount": suite_diff["added_count"] if suite_diff else 0,
                "removedCount": suite_diff["removed_count"] if suite_diff else 0,
                "distributedCount": math["distributed_count"],
                "distributionGap": None if baseline_count is None else math["distribution_gap"],
                "plannedToDate": math["planned_to_date"],
                "finalizedCount": finalized,
                "failed": metrics["cts_falhados"],
                "blocked": metrics["cts_bloqueados"],
                "passed": metrics["cts_passeds"],
                "na": metrics["cts_na"],
                "released": metrics["cts_liberados"],
                "design": metrics["cts_design"],
                "notReleased": metrics["cts_nao_liberados"],
                "unclassifiedCount": sum(1 for p in points if p.get("integrity") == "unmapped"),
                "inconsistentCount": sum(1 for p in points if p.get("integrity") == "inconsistent"),
                "backlog": math["backlog"],
                "aheadOfPlan": math["ahead_of_plan"],
                "allocations": allocations,
                "warnings": [w for w in [
                    scope_integrity_message(scope_snapshot_available=True, added_count=int(suite_diff["added_count"]), removed_count=int(suite_diff["removed_count"])) if snapshot and suite_diff else None,
                    classification_integrity_message(
                        sum(1 for p in points if p.get("integrity") == "unmapped"),
                        sum(1 for p in points if p.get("integrity") == "inconsistent"),
                    ),
                    schedule_integrity_message(int(baseline_count or 0), int(math["distributed_count"])) if baseline_count is not None else None,
                ] if w],
            }
        )
    date_set: set[str] = set()
    for item in items:
        for day in dates_between(item.get("plannedStart"), item.get("plannedEnd")):
            date_set.add(day)
        for day in item.get("allocations", {}):
            cd = calendar_date(day)
            if cd:
                date_set.add(cd)
    baseline_count = diff["baseline_count"] if snapshot else sum(float(i.get("baselineCount") or 0) for i in items)
    distributed_count = sum(i["distributedCount"] for i in items)
    planned_to_date = sum(i["plannedToDate"] for i in items)
    finalized_count = sum(float(i.get("finalizedCount") or 0) for i in items)
    if revision:
        origin = {
            "version": revision["version"],
            "reason": revision["reason"],
            "createdAt": revision["created_at"],
            "baselineOrigin": "motor",
            "scopeSnapshotAvailable": snapshot,
        }
    elif legacy:
        origin = {"version": None, "reason": None, "createdAt": None, "baselineOrigin": "legacy", "scopeSnapshotAvailable": False}
    else:
        origin = {"version": None, "reason": None, "createdAt": None, "baselineOrigin": "ausente", "scopeSnapshotAvailable": False}
    return {
        "planning": {"planKey": plan_key},
        "revision": origin,
        "summary": {
            "baselineCount": baseline_count,
            "sourceCount": len(source_scope),
            "addedCount": diff["added_count"] if snapshot else 0,
            "removedCount": diff["removed_count"] if snapshot else 0,
            "scopeDelta": diff["scope_delta"] if snapshot else 0,
            "distributedCount": distributed_count,
            "distributionGap": distributed_count - baseline_count,
            "plannedToDate": planned_to_date,
            "finalizedCount": finalized_count,
            "backlog": max(planned_to_date - finalized_count, 0),
            "aheadOfPlan": max(finalized_count - planned_to_date, 0),
            "classifiedCount": classified,
            "unclassifiedCount": unclassified,
            "inconsistentCount": inconsistent,
            "scopeCheck": _scope_note(origin["baselineOrigin"], snapshot, int(diff["added_count"]) if snapshot else 0, int(diff["removed_count"]) if snapshot else 0),
        },
        "dimensions": _catalog(plan_key, exec_rows, bag),
        "dates": sorted(date_set),
        "items": items,
        "integrity": {
            "scope": _scope_note(origin["baselineOrigin"], snapshot, int(diff["added_count"]) if snapshot else 0, int(diff["removed_count"]) if snapshot else 0),
            "classification": classification_integrity_message(unclassified, inconsistent),
            "schedule": schedule_integrity_message(baseline_count, distributed_count),
        },
        "executionHistory": {
            "reconstructed": False,
            "note": "O histórico de execução passa a ser observável a partir das sincronizações do FourQA. O estado atual do Test Point não reconstrói execuções antigas.",
        },
        "revisions": await planning.list_revisions(plan_key),
        "editable": editable,
    }


def _legacy_planning_view(plan_key: str, as_of: str, legacy_rows: list[LegacyPlanRow], exec_rows: list[ExecucaoRow], source_count: int) -> dict[str, Any]:
    points = [assess_point(r) for r in exec_rows]
    metrics = metricas_dos_pontos(exec_rows)
    cancelados = sum(float(r.get("cts_cancelados") or 0) for r in legacy_rows)
    finalized_count = metrics["cts_passeds"] + metrics["cts_na"] + cancelados
    has_priority = any((r.get("prioridades") or "").strip() for r in legacy_rows)
    has_front = any((r.get("frente") or "").strip() for r in legacy_rows)
    dimensions: list[dict[str, Any]] = []
    if has_priority:
        dimensions.append({"key": "prioridades", "label": "Prioridade", "level": 1, "values": [], "role": "priority", "confidence": 1, "visible": True})
    if has_front:
        dimensions.append({"key": "frente", "label": "Frente", "level": 2, "values": [], "role": "front", "confidence": 1, "visible": True})
    items = []
    for row in legacy_rows:
        baseline_count = float(row.get("qtd_cts_plan") or 0)
        math = schedule_of(baseline_count=int(baseline_count), allocations=[], as_of=as_of, finalized_count=0)
        schedule = schedule_integrity_message(baseline_count, 0)
        items.append(
            {
                "suiteId": None,
                "testPointId": None,
                "suiteName": (row.get("processo") or "").strip() or "(sem nome)",
                "responsavel": None,
                "prioridade": None,
                "dimensions": {
                    **({"prioridades": (row.get("prioridades") or "").strip()} if has_priority and (row.get("prioridades") or "").strip() else {}),
                    **({"frente": (row.get("frente") or "").strip()} if has_front and (row.get("frente") or "").strip() else {}),
                },
                "plannedStart": calendar_date(row.get("data_inicio")),
                "plannedEnd": calendar_date(row.get("data_fim")),
                "baselineCount": baseline_count,
                "sourceCount": None,
                "addedCount": 0,
                "removedCount": 0,
                "distributedCount": 0,
                "distributionGap": math["distribution_gap"],
                "plannedToDate": 0,
                "finalizedCount": None,
                "failed": None,
                "blocked": None,
                "passed": None,
                "na": None,
                "released": None,
                "design": None,
                "notReleased": None,
                "unclassifiedCount": 0,
                "inconsistentCount": 0,
                "backlog": None,
                "aheadOfPlan": None,
                "allocations": {},
                "warnings": [schedule] if schedule else [],
            }
        )
    date_set: set[str] = set()
    for item in items:
        for day in dates_between(item.get("plannedStart"), item.get("plannedEnd")):
            date_set.add(day)
    baseline_count = sum(float(i.get("baselineCount") or 0) for i in items)
    scope = scope_integrity_message(scope_snapshot_available=False, added_count=0, removed_count=0)
    schedule_msg = schedule_integrity_message(int(baseline_count), 0)
    math = schedule_of(baseline_count=int(baseline_count), allocations=[], as_of=as_of, finalized_count=int(finalized_count))
    return {
        "planning": {"planKey": plan_key},
        "revision": {"version": None, "reason": None, "createdAt": None, "baselineOrigin": "legacy", "scopeSnapshotAvailable": False},
        "summary": {
            "baselineCount": baseline_count,
            "sourceCount": source_count,
            "addedCount": 0,
            "removedCount": 0,
            "scopeDelta": 0,
            "distributedCount": 0,
            "distributionGap": math["distribution_gap"],
            "plannedToDate": 0,
            "finalizedCount": finalized_count,
            "backlog": math["backlog"],
            "aheadOfPlan": math["ahead_of_plan"],
            "classifiedCount": sum(1 for p in points if p.get("classification") != "unclassified"),
            "unclassifiedCount": sum(1 for p in points if p.get("integrity") == "unmapped"),
            "inconsistentCount": sum(1 for p in points if p.get("integrity") == "inconsistent"),
            "scopeCheck": scope,
        },
        "dimensions": dimensions,
        "dates": sorted(date_set),
        "items": items,
        "integrity": {
            "scope": scope,
            "classification": classification_integrity_message(
                sum(1 for p in points if p.get("integrity") == "unmapped"),
                sum(1 for p in points if p.get("integrity") == "inconsistent"),
            ),
            "schedule": schedule_msg,
        },
        "executionHistory": {
            "reconstructed": False,
            "note": "O histórico de execução passa a ser observável a partir das sincronizações do FourQA. O estado atual do Test Point não reconstrói execuções antigas. O planejamento legado não liga cada processo aos Test Points.",
        },
        "revisions": [],
        "editable": True,
    }


async def get_planning_history(plan_key: str, limit: int = 300) -> dict[str, Any]:
    planning = (await _stores())["planning"]
    supported = await planning.change_log_supported()
    if not supported:
        return {"supported": False, "entries": []}
    entries = await planning.list_change_log(plan_key, limit)
    return {"supported": True, "entries": [_entry_camel(e) for e in entries]}


def _entry_camel(e: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "id": e.get("id"),
        "createdAt": e.get("created_at"),
        "actor": e.get("actor"),
        "suiteId": e.get("suite_id"),
        "testPointId": e.get("test_point_id"),
        "suiteName": e.get("suite_name"),
        "field": e.get("field"),
        "allocDate": e.get("alloc_date"),
        "oldValue": e.get("old_value"),
        "newValue": e.get("new_value"),
    }


async def confirm_or_revise(plan_key: str, input: dict[str, Any]) -> dict[str, Any]:
    stores = await _stores()
    planning = stores["planning"]
    current = await planning.latest_revision(plan_key)
    if not input.get("adoptSource", True) and (not current or current.get("scope_snapshot") != 1):
        raise ValueError("Confirme um baseline com snapshot antes de replanejar.")
    scope = await _source_scope(plan_key) if input.get("adoptSource", True) or not current else await planning.load_scope(current["id"])
    now = _utc_stamp()
    source_schedule = await planning.load_schedule(current["id"]) if current else []
    items = (
        await _copied_schedule(current["id"])
        if current and not input.get("adoptSource", True)
        else await _items_for_new_revision(plan_key, scope, current["id"] if current else None)
    )
    await planning.commit_revision(
        {
            "plan_key": plan_key,
            "created_at": now,
            "version": (current["version"] if current else 0) + 1,
            "reason": (input.get("reason") or "").strip() or "Confirmação do baseline",
            "baseline_origin": "motor",
            "scope_snapshot": 1,
            "scope": scope,
            "items": items,
            "base_revision_id": current["id"] if current else None,
            "base_fingerprint": schedule_fingerprint(source_schedule) if current else None,
        }
    )
    return await get_planning_view(plan_key)


async def _source_scope(plan_key: str) -> list[PlanningScopeWrite]:
    exec_rows = await (await _stores())["azure_snapshot"].list_execucoes(plan_key)
    return [
        {
            "plan_id": r.get("plan_id"),
            "suite_id": r.get("suite_id"),
            "test_point_id": r.get("test_point_id"),
            "test_case_id": r.get("test_case_id"),
            "label": r.get("atalho"),
        }
        for r in exec_rows
        if r.get("test_point_id") is not None
    ]


async def _copied_schedule(revision_id: int) -> list[PlanningItemWrite]:
    return _item_writes(await (await _stores())["planning"].load_schedule(revision_id))


def _item_writes(rows: Iterable[Mapping[str, Any]]) -> list[PlanningItemWrite]:
    return [
        {
            "suite_id": r.get("suite_id"),
            "suite_name": r.get("suite_name"),
            "test_point_id": r.get("test_point_id"),
            "test_case_id": r.get("test_case_id"),
            "planned_start": r.get("planned_start"),
            "planned_end": r.get("planned_end"),
            "responsavel": r.get("responsavel"),
            "prioridade": r.get("prioridade"),
            "baseline_quantity": r.get("baseline_quantity"),
            "allocations": [{"date": a["date"], "quantity": a["quantity"]} for a in r.get("allocations") or []],
        }
        for r in rows
    ]


async def _items_for_new_revision(
    plan_key: str, scope: Sequence[Mapping[str, Any]], previous_revision_id: int | None
) -> list[PlanningItemWrite]:
    exec_rows = await (await _stores())["azure_snapshot"].list_execucoes(plan_key)
    names = {r.get("suite_id"): r.get("suite_name") for r in exec_rows if r.get("suite_id") is not None and r.get("suite_name")}
    legacy = {(r.get("processo") or "").strip().lower(): r for r in await _legacy_base(plan_key)}
    previous = [] if previous_revision_id is None else await _copied_schedule(previous_revision_id)

    def inherited(suite_name: str) -> dict[str, str | None] | None:
        row = legacy.get(suite_name.strip().lower())
        if row is None:
            return None
        return {"start": calendar_date(row.get("data_inicio")), "end": calendar_date(row.get("data_fim"))}

    return _item_writes(schedule_items_for_scope(scope=scope, suite_names=names, previous=previous, inherited=inherited))


async def save_planning_cell(plan_key: str, input: dict[str, Any]) -> dict[str, Any]:
    await _ensure_operational_revision(plan_key)
    planning = (await _stores())["planning"]
    revision = await planning.latest_revision(plan_key)
    if not revision:
        raise ValueError("Não foi possível preparar o planejamento para edição.")
    schedule = await planning.load_schedule(revision["id"])
    item = match_schedule_item(
        schedule,
        {
            "suite_id": input.get("suiteId"),
            "test_point_id": input.get("testPointId"),
        },
    )
    if not item:
        raise ValueError("Suíte fora do baseline confirmado.")
    field = input["field"]
    change_base = {
        "plan_key": plan_key,
        "suite_id": item.get("suite_id"),
        "test_point_id": item.get("test_point_id"),
        "suite_name": item.get("suite_name"),
    }
    if field in ("responsavel", "prioridade"):
        if item.get("suite_id") is None:
            raise ValueError("Responsável e prioridade exigem Suite ID.")
        old = item.get(field)
        new = normalize_suite_fill(input.get("value"))
        await planning.save_cell(
            {
                "plan_key": plan_key,
                "revision_id": revision["id"],
                "item_id": item["id"],
                "field": field,
                "value": new,
                "guard": input.get("guard"),
                "expected_text": input.get("expectedText"),
                "change_log": _cell_change(change_base, field, old, new),
            }
        )
        return await get_planning_view(plan_key)
    if field == "day":
        day = calendar_date(input.get("date"))
        qty = input.get("quantity")
        if not day or qty is None or float(qty) < 0:
            raise ValueError("Informe data e quantidade.")
        old_qty = next((a["quantity"] for a in item.get("allocations") or [] if a["date"] == day), 0)
        await planning.save_cell(
            {
                "plan_key": plan_key,
                "revision_id": revision["id"],
                "item_id": item["id"],
                "field": "day",
                "date": day,
                "quantity": qty,
                "guard": input.get("guard"),
                "expected_quantity": input.get("expectedQuantity"),
                "change_log": _cell_change(change_base, "day", old_qty, qty, day),
            }
        )
    else:
        day = calendar_date(input.get("date")) if input.get("date") else None
        if input.get("date") and not day:
            raise ValueError("Data inválida.")
        col = "planned_start" if field == "start" else "planned_end"
        old = item.get(col.replace("planned_", "planned_"))
        await planning.save_cell(
            {
                "plan_key": plan_key,
                "revision_id": revision["id"],
                "item_id": item["id"],
                "field": field,
                "date": day,
                "guard": input.get("guard"),
                "expected_text": input.get("expectedText"),
                "change_log": _cell_change(change_base, field, old, day, day),
            }
        )
    return await get_planning_view(plan_key)


def _cell_change(base: dict[str, Any], field: str, old: Any, new: Any, alloc_date: str | None = None) -> dict[str, Any] | None:
    if old == new:
        return None
    return {**base, "field": field, "alloc_date": alloc_date, "old_value": None if old is None else str(old), "new_value": None if new is None else str(new)}


async def save_planning_batch(plan_key: str, changes: list[dict[str, Any]]) -> dict[str, Any]:
    if not changes:
        raise ValueError("Nenhuma alteração.")
    if len(changes) > 400:
        raise ValueError("Seleção grande demais para gravar de uma vez.")
    await _ensure_operational_revision(plan_key)
    planning = (await _stores())["planning"]
    revision = await planning.latest_revision(plan_key)
    if not revision:
        raise ValueError("Não foi possível preparar o planejamento para edição.")
    schedule = await planning.load_schedule(revision["id"])
    writes: list[dict[str, Any]] = []
    for change in changes:
        item = match_schedule_item(
            schedule,
            {"suite_id": change.get("suiteId"), "test_point_id": change.get("testPointId")},
        )
        if not item:
            raise ValueError("Suíte fora do baseline confirmado.")
        field = change["field"]
        change_base = {
            "plan_key": plan_key,
            "suite_id": item.get("suite_id"),
            "test_point_id": item.get("test_point_id"),
            "suite_name": item.get("suite_name"),
        }
        if field == "day":
            day = calendar_date(change.get("date"))
            qty = change.get("quantity")
            if not day or qty is None:
                raise ValueError("Informe data e quantidade.")
            old_qty = next((a["quantity"] for a in item.get("allocations") or [] if a["date"] == day), 0)
            if old_qty != qty:
                log = _cell_change(change_base, "day", old_qty, qty, day)
                if log:
                    writes.append(
                        {
                            "plan_key": plan_key,
                            "revision_id": revision["id"],
                            "item_id": item["id"],
                            "field": "day",
                            "date": day,
                            "quantity": qty,
                            "guard": change.get("guard"),
                            "expected_quantity": change.get("expectedQuantity"),
                            "change_log": log,
                        }
                    )
        else:
            day = calendar_date(change.get("date"))
            if not day:
                raise ValueError("Data inválida.")
            col = "planned_start" if field == "start" else "planned_end"
            old = item.get(col)
            if old != day:
                log = _cell_change(change_base, field, old, day, day)
                if log:
                    writes.append(
                        {
                            "plan_key": plan_key,
                            "revision_id": revision["id"],
                            "item_id": item["id"],
                            "field": field,
                            "date": day,
                            "guard": change.get("guard"),
                            "expected_text": change.get("expectedText"),
                            "change_log": log,
                        }
                    )
    if writes:
        await planning.save_cells(writes)
    return await get_planning_view(plan_key)


async def distribute_planning(plan_key: str, input: dict[str, Any]) -> dict[str, Any]:
    if not is_distribution_strategy(input.get("strategy", "")):
        raise ValueError("Estratégia inválida.")
    preview = input.get("preview") is True
    if not preview:
        await _ensure_operational_revision(plan_key)
    revision = await (await _stores())["planning"].latest_revision(plan_key)
    start = calendar_date(input.get("start"))
    end = calendar_date(input.get("end"))
    if not start or not end or start > end:
        raise ValueError("Informe início e fim válidos.")
    resguardo = input.get("resguardo")
    if not isinstance(resguardo, int) or resguardo < 0:
        raise ValueError("Resguardo inválido.")
    enabled = {d for d in input.get("enabledWeekendDays") or [] if calendar_date(d) == d}
    curve_end = shift_calendar_day(end, -resguardo)
    if not curve_end or curve_end < start:
        raise ValueError("O resguardo passa do início do período.")
    mode = "saldo" if input.get("mode") == "saldo" else "completo"
    cut = calendar_date(input.get("cut") or "") if mode == "saldo" else None
    if mode == "saldo" and not cut:
        raise ValueError("Informe a data de corte do saldo.")
    days = distribution_days(start, end, resguardo, enabled)
    if cut:
        days = [d for d in days if d >= cut]
    if not days:
        raise ValueError("Nenhum dia habilitado nesse período.")
    scope = await (await _stores())["planning"].load_scope(revision["id"]) if revision else await _source_scope(plan_key)
    schedule: Sequence[Mapping[str, Any]] = await (await _stores())["planning"].load_schedule(revision["id"]) if revision else []
    if not schedule and not preview:
        schedule = [{"id": -(i + 1), **item} for i, item in enumerate(await _items_for_new_revision(plan_key, scope, None))]
    balances = await _balance_by_suite(plan_key, scope)
    strategy = input["strategy"]
    replace = input.get("replace") is True
    day_window = set(days)
    writes: list[dict[str, Any]] = []
    shares = []
    for item in schedule:
        key = previous_fill_key({"suite_id": item.get("suite_id"), "test_point_id": item.get("test_point_id")})
        balance = balances.get(key or "")
        baseline = int(item.get("baseline_quantity") or 0)
        pending = balance["pending"] if balance else 0
        total = pending if mode == "saldo" else max(baseline, sum(a["quantity"] for a in item.get("allocations") or [] if a["quantity"] > 0))
        shares.append({"key": str(item["id"]), "total": total, "allocations": item.get("allocations") or [], "clearWindow": total == 0 and mode == "saldo"})
    deltas_by_item = apportion_distribution(shares, days, strategy, replace)
    changed = False
    for item in schedule:
        deltas = deltas_by_item.get(str(item["id"]), [])
        if deltas:
            changed = True
        if preview or not revision or item["id"] < 0:
            continue
        for delta in deltas:
            writes.append(
                {
                    "plan_key": plan_key,
                    "revision_id": revision["id"],
                    "item_id": item["id"],
                    "field": "day",
                    "date": delta["date"],
                    "quantity": delta["quantity"],
                    "guard": True,
                    "expected_quantity": delta["previous"],
                    "change_log": _cell_change(
                        {"plan_key": plan_key, "suite_id": item.get("suite_id"), "test_point_id": item.get("test_point_id"), "suite_name": item.get("suite_name")},
                        "day",
                        delta["previous"],
                        delta["quantity"],
                        delta["date"],
                    ),
                }
            )
    body = {"preview": True, "mode": mode, "cut": cut, "suiteCount": len(schedule), "finalized": 0, "pending": 0, "unchanged": not changed, "days": []}
    if preview:
        if not changed:
            raise ValueError("Não há quantidade planejada para distribuir.")
        return body
    if not writes:
        raise ValueError("A agenda já segue essa distribuição.")
    await (await _stores())["planning"].save_cells([w for w in writes if w.get("change_log")])
    return await get_planning_view(plan_key)


async def clear_planning_to_finalized(plan_key: str, input: dict[str, Any] | None = None) -> dict[str, Any]:
    input = input or {}
    preview = input.get("preview") is True
    if not preview:
        await _ensure_operational_revision(plan_key)
    revision = await (await _stores())["planning"].latest_revision(plan_key)
    if not revision:
        if preview:
            return {"preview": True, "action": "limpar", "suiteCount": 0, "finalized": 0, "kept": 0, "removed": 0, "unchanged": True}
        raise ValueError("Não há agenda para limpar.")
    scope = await (await _stores())["planning"].load_scope(revision["id"])
    schedule = await (await _stores())["planning"].load_schedule(revision["id"])
    balances = await _balance_by_suite(plan_key, scope)
    writes: list[dict[str, Any]] = []
    removed = 0
    for item in schedule:
        key = previous_fill_key({"suite_id": item.get("suite_id"), "test_point_id": item.get("test_point_id")})
        balance = balances.get(key or "")
        if not balance:
            continue
        deltas = trim_allocations_to_keep(item.get("allocations") or [], balance["finalized"])
        cut = sum(d["previous"] - d["quantity"] for d in deltas)
        removed += cut
        if preview:
            continue
        for delta in deltas:
            log = _cell_change(
                {"plan_key": plan_key, "suite_id": item.get("suite_id"), "test_point_id": item.get("test_point_id"), "suite_name": item.get("suite_name")},
                "day",
                delta["previous"],
                delta["quantity"],
                delta["date"],
            )
            if log:
                writes.append(
                    {
                        "plan_key": plan_key,
                        "revision_id": revision["id"],
                        "item_id": item["id"],
                        "field": "day",
                        "date": delta["date"],
                        "quantity": delta["quantity"],
                        "guard": True,
                        "expected_quantity": delta["previous"],
                        "change_log": log,
                    }
                )
    if preview:
        return {"preview": True, "action": "limpar", "suiteCount": len(schedule), "finalized": 0, "kept": 0, "removed": removed, "unchanged": removed == 0}
    if removed == 0 or not writes:
        raise ValueError("A agenda já conserva só os finalizados.")
    await (await _stores())["planning"].save_cells(writes)
    return await get_planning_view(plan_key)


async def _ensure_operational_revision(plan_key: str) -> None:
    planning = (await _stores())["planning"]
    current = await planning.latest_revision(plan_key)
    if current and current.get("scope_snapshot") == 1:
        return
    scope = await _source_scope(plan_key)
    now = _utc_stamp()
    scheduled = await planning.load_schedule(current["id"]) if current else []
    items = await _copied_schedule(current["id"]) if current and scheduled else await _items_for_new_revision(plan_key, scope, current["id"] if current else None)
    source_schedule = await planning.load_schedule(current["id"]) if current else []
    await planning.commit_revision(
        {
            "plan_key": plan_key,
            "created_at": now,
            "version": (current["version"] if current else 0) + 1,
            "reason": "Planejamento operacional",
            "baseline_origin": "motor",
            "scope_snapshot": 1,
            "scope": scope,
            "items": items,
            "base_revision_id": current["id"] if current else None,
            "base_fingerprint": schedule_fingerprint(source_schedule) if current else None,
        }
    )


async def _balance_by_suite(plan_key: str, scope: Sequence[Mapping[str, Any]]) -> dict[str, dict[str, int]]:
    exec_rows = await (await _stores())["azure_snapshot"].list_execucoes(plan_key)
    exec_by_point = {point: r for r in exec_rows if (point := r.get("test_point_id")) is not None}
    groups: dict[str, list[str]] = {}
    for ref in scope:
        key = previous_fill_key({"suite_id": ref.get("suite_id"), "test_point_id": ref.get("test_point_id")})
        if not key:
            continue
        point = ref.get("test_point_id")
        row = exec_by_point.get(point) if point is not None else None
        classification = classify_execution(row) if row else "pendente"
        groups.setdefault(key, []).append(classification)
    return {k: count_planning_balance(v) for k, v in groups.items()}
