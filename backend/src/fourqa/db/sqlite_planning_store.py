"""SQLite planning store (mirrors backend/src/db/sqlitePlanningStore.ts)."""

from __future__ import annotations

from datetime import datetime, timezone

from fourqa.db.db import get_db
from fourqa.domain.planning import normalize_suite_fill
from fourqa.persistence.contracts import (
    CommitRevisionInput,
    PlanningChangeLogEntry,
    PlanningChangeLogWrite,
    PlanningRevisionRecord,
    PlanningScheduleItem,
    PlanningScopeWrite,
)
from fourqa.persistence.planning_conflict import PlanningConflictError

REVISION_SQL = """
SELECT r.id, r.version, r.created_at, r.reason, r.baseline_origin, r.scope_snapshot
FROM planning_revision r
JOIN planning p ON p.id = r.planning_id
WHERE p.plan_key = ?
"""

BATCH_HISTORY_UNAVAILABLE = "Histórico de planejamento indisponível. Nenhuma alteração foi gravada."


def latest_revision(plan_key: str) -> PlanningRevisionRecord | None:
    row = get_db().execute(f"{REVISION_SQL} ORDER BY r.version DESC LIMIT 1", (plan_key,)).fetchone()
    return dict(row) if row else None  # type: ignore[return-value]


def revision_by_version(plan_key: str, version: int) -> PlanningRevisionRecord | None:
    row = get_db().execute(f"{REVISION_SQL} AND r.version = ?", (plan_key, version)).fetchone()
    return dict(row) if row else None  # type: ignore[return-value]


def list_revisions(plan_key: str) -> list[dict[str, object]]:
    rows = get_db().execute(
        """
        SELECT r.version, r.created_at, r.reason
        FROM planning_revision r
        JOIN planning p ON p.id = r.planning_id
        WHERE p.plan_key = ?
        ORDER BY r.version
        """,
        (plan_key,),
    ).fetchall()
    return [{"version": r[0], "createdAt": r[1], "reason": r[2]} for r in rows]


def load_scope(revision_id: int) -> list[PlanningScopeWrite]:
    rows = get_db().execute(
        """
        SELECT plan_id, suite_id, test_point_id, test_case_id, label
        FROM planning_scope_item WHERE revision_id = ?
        """,
        (revision_id,),
    ).fetchall()
    return [
        {
            "plan_id": r[0],
            "suite_id": r[1],
            "test_point_id": r[2],
            "test_case_id": r[3],
            "label": r[4],
        }
        for r in rows
    ]


def load_schedule(revision_id: int) -> list[PlanningScheduleItem]:
    db = get_db()
    items = db.execute(
        """
        SELECT id, suite_id, suite_name, test_point_id, test_case_id, planned_start, planned_end,
               baseline_quantity, responsavel, prioridade
        FROM planning_item WHERE revision_id = ?
        """,
        (revision_id,),
    ).fetchall()
    allocs = db.execute(
        """
        SELECT a.item_id, a.alloc_date, a.planned_quantity
        FROM planning_allocation a
        JOIN planning_item i ON i.id = a.item_id
        WHERE i.revision_id = ?
        """,
        (revision_id,),
    ).fetchall()
    by_item: dict[int, list[dict[str, object]]] = {}
    for row in allocs:
        by_item.setdefault(int(row[0]), []).append({"date": row[1], "quantity": row[2]})
    out: list[PlanningScheduleItem] = []
    for item in items:
        iid = int(item[0])
        out.append(
            {
                "id": iid,
                "suite_id": item[1],
                "suite_name": item[2],
                "test_point_id": item[3],
                "test_case_id": item[4],
                "planned_start": item[5],
                "planned_end": item[6],
                "baseline_quantity": item[7],
                "responsavel": item[8],
                "prioridade": item[9],
                "allocations": by_item.get(iid, []),
            }
        )
    return out


def commit_revision(input: CommitRevisionInput) -> int:
    db = get_db()
    db.execute("BEGIN IMMEDIATE")
    try:
        existing = db.execute("SELECT id FROM planning WHERE plan_key = ?", (input["plan_key"],)).fetchone()
        if existing:
            planning_id = int(existing[0])
        else:
            cur = db.execute(
                "INSERT INTO planning (plan_key, created_at) VALUES (?, ?)",
                (input["plan_key"], input["created_at"]),
            )
            planning_id = int(cur.lastrowid)
        cur = db.execute(
            """
            INSERT INTO planning_revision (planning_id, version, created_at, reason, baseline_origin, scope_snapshot)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                planning_id,
                input["version"],
                input["created_at"],
                input["reason"],
                input["baseline_origin"],
                input["scope_snapshot"],
            ),
        )
        revision_id = int(cur.lastrowid)
        for item in input["scope"]:
            db.execute(
                """
                INSERT INTO planning_scope_item (revision_id, plan_id, suite_id, test_point_id, test_case_id, label)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    revision_id,
                    item.get("plan_id"),
                    item.get("suite_id"),
                    item.get("test_point_id"),
                    item.get("test_case_id"),
                    item.get("label"),
                ),
            )
        for item in input["items"]:
            cur = db.execute(
                """
                INSERT INTO planning_item (
                  revision_id, suite_id, suite_name, test_point_id, test_case_id,
                  planned_start, planned_end, baseline_quantity, responsavel, prioridade
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    revision_id,
                    item.get("suite_id"),
                    item.get("suite_name"),
                    item.get("test_point_id"),
                    item.get("test_case_id"),
                    item.get("planned_start"),
                    item.get("planned_end"),
                    item.get("baseline_quantity"),
                    normalize_suite_fill(item.get("responsavel")),
                    normalize_suite_fill(item.get("prioridade")),
                ),
            )
            item_id = int(cur.lastrowid)
            for alloc in item.get("allocations") or []:
                db.execute(
                    "INSERT INTO planning_allocation (item_id, alloc_date, planned_quantity) VALUES (?, ?, ?)",
                    (item_id, alloc["date"], alloc["quantity"]),
                )
        db.commit()
        return revision_id
    except Exception:
        db.rollback()
        raise


def _apply_cell(input: dict[str, object]) -> None:
    db = get_db()
    field = input["field"]
    item_id = input["item_id"]
    if field == "day":
        db.execute("DELETE FROM planning_allocation WHERE item_id = ? AND alloc_date = ?", (item_id, input["date"]))
        if float(input.get("quantity") or 0) > 0:
            db.execute(
                "INSERT INTO planning_allocation (item_id, alloc_date, planned_quantity) VALUES (?, ?, ?)",
                (item_id, input["date"], input["quantity"]),
            )
    elif field == "responsavel":
        db.execute(
            "UPDATE planning_item SET responsavel = ? WHERE id = ?",
            (normalize_suite_fill(input.get("value")), item_id),
        )
    elif field == "prioridade":
        db.execute(
            "UPDATE planning_item SET prioridade = ? WHERE id = ?",
            (normalize_suite_fill(input.get("value")), item_id),
        )
    elif field == "start":
        db.execute("UPDATE planning_item SET planned_start = ? WHERE id = ?", (input.get("date"), item_id))
    elif field == "end":
        db.execute("UPDATE planning_item SET planned_end = ? WHERE id = ?", (input.get("date"), item_id))
    else:
        raise ValueError(f"Campo de planejamento não suportado ({field!r})")


def _planning_id_for_key(plan_key: str) -> int | None:
    row = get_db().execute("SELECT id FROM planning WHERE plan_key = ?", (plan_key,)).fetchone()
    return int(row[0]) if row else None


def _insert_change_log(input: PlanningChangeLogWrite) -> None:
    planning_id = _planning_id_for_key(input["plan_key"])
    if planning_id is None:
        return
    created_at = datetime.now(timezone.utc).isoformat()
    get_db().execute(
        """
        INSERT INTO planning_change_log (
          planning_id, created_at, actor, suite_id, test_point_id, suite_name,
          field, alloc_date, old_value, new_value
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            planning_id,
            created_at,
            input.get("actor"),
            input.get("suite_id"),
            input.get("test_point_id"),
            input.get("suite_name"),
            input["field"],
            input.get("alloc_date"),
            input.get("old_value"),
            input.get("new_value"),
        ),
    )
    get_db().commit()


def save_cell(input: dict[str, object]) -> None:
    db = get_db()
    transactional = input.get("field") == "day" or input.get("change_log") is not None
    if not transactional:
        _apply_cell(input)
        db.commit()
        return
    db.execute("BEGIN IMMEDIATE")
    try:
        _apply_cell(input)
        if input.get("change_log"):
            _insert_change_log(input["change_log"])  # type: ignore[arg-type]
        db.commit()
    except Exception:
        db.rollback()
        raise


def _assert_batch(inputs: list[dict[str, object]]) -> None:
    if any(inp.get("change_log") is None for inp in inputs):
        raise RuntimeError(BATCH_HISTORY_UNAVAILABLE)
    db = get_db()
    plan_key = next((str(inp["plan_key"]) for inp in inputs if inp.get("plan_key")), None)
    revision_id = next((inp.get("revision_id") for inp in inputs if inp.get("revision_id") is not None), None)
    if plan_key and revision_id is not None:
        latest = latest_revision(plan_key)
        if not latest or latest["id"] != revision_id:
            raise PlanningConflictError(PlanningConflictError.baseline_revised)
    for inp in inputs:
        if revision_id is not None:
            owner = db.execute(
                "SELECT 1 AS ok FROM planning_item WHERE id = ? AND revision_id = ?",
                (inp["item_id"], revision_id),
            ).fetchone()
            if not owner:
                raise PlanningConflictError(PlanningConflictError.item_out_of_revision)
        if not inp.get("guard"):
            continue
        if inp.get("field") == "day":
            row = db.execute(
                "SELECT planned_quantity FROM planning_allocation WHERE item_id = ? AND alloc_date = ?",
                (inp["item_id"], inp["date"]),
            ).fetchone()
            qty = float(row[0]) if row else 0
            if abs(qty - float(inp.get("expected_quantity") or 0)) > 1e-9:
                raise PlanningConflictError(PlanningConflictError.cell_changed)
        elif inp.get("field") in ("start", "end"):
            column = "planned_start" if inp["field"] == "start" else "planned_end"
            row = db.execute(f"SELECT {column} AS value FROM planning_item WHERE id = ?", (inp["item_id"],)).fetchone()
            stored = row[0] if row and row[0] is not None else ""
            if stored != (inp.get("expected_text") or ""):
                raise PlanningConflictError(PlanningConflictError.cell_changed)


def save_cells(inputs: list[dict[str, object]]) -> None:
    if not inputs:
        return
    db = get_db()
    db.execute("BEGIN IMMEDIATE")
    try:
        _assert_batch(inputs)
        for inp in inputs:
            _apply_cell(inp)
            log = inp.get("change_log")
            if not log or _planning_id_for_key(log["plan_key"]) is None:  # type: ignore[index]
                raise RuntimeError(BATCH_HISTORY_UNAVAILABLE)
            _insert_change_log(log)  # type: ignore[arg-type]
        db.commit()
    except Exception:
        db.rollback()
        raise


def append_change_log(input: PlanningChangeLogWrite) -> None:
    _insert_change_log(input)


def list_change_log(plan_key: str, limit: int = 300) -> list[PlanningChangeLogEntry]:
    planning_id = _planning_id_for_key(plan_key)
    if planning_id is None:
        return []
    cap = min(max(1, limit), 1000)
    rows = get_db().execute(
        """
        SELECT id, created_at, actor, suite_id, test_point_id, suite_name, field, alloc_date, old_value, new_value
        FROM planning_change_log
        WHERE planning_id = ?
        ORDER BY created_at DESC, id DESC
        LIMIT ?
        """,
        (planning_id, cap),
    ).fetchall()
    return [
        {
            "id": r[0],
            "created_at": r[1],
            "actor": r[2],
            "suite_id": r[3],
            "test_point_id": r[4],
            "suite_name": r[5],
            "field": r[6],
            "alloc_date": r[7],
            "old_value": r[8],
            "new_value": r[9],
        }
        for r in rows
    ]


def change_log_supported() -> bool:
    row = get_db().execute(
        "SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = 'planning_change_log'"
    ).fetchone()
    return row is not None


sqlite_planning_store = {
    "latest_revision": latest_revision,
    "revision_by_version": revision_by_version,
    "list_revisions": list_revisions,
    "load_scope": load_scope,
    "load_schedule": load_schedule,
    "commit_revision": commit_revision,
    "save_cell": save_cell,
    "save_cells": save_cells,
    "append_change_log": append_change_log,
    "list_change_log": list_change_log,
    "change_log_supported": change_log_supported,
}
