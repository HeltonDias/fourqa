"""PostgreSQL planning store (mirrors postgresPlanningStore.ts + sqlite change-log)."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from psycopg import AsyncConnection

from fourqa.db.postgres.migrate import PLANNING_CHANGE_LOG_VERSION
from fourqa.db.postgres.pool import as_flag, as_number, as_number_or_null, as_text, bind, query, with_transaction
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
WHERE p.plan_key = $1
"""

BATCH_HISTORY_UNAVAILABLE = "Histórico de planejamento indisponível. Nenhuma alteração foi gravada."


def _revision_of(row: dict[str, Any] | None) -> PlanningRevisionRecord | None:
    if not row:
        return None
    return {
        "id": int(as_number(row["id"])),
        "version": int(as_number(row["version"])),
        "created_at": as_text(row["created_at"]) or "",
        "reason": as_text(row["reason"]) or "",
        "baseline_origin": as_text(row["baseline_origin"]) or "",
        "scope_snapshot": as_flag(row["scope_snapshot"]),
    }


async def _insert_returning_id(conn: AsyncConnection, sql: str, params: list[Any]) -> int:
    cur = await conn.execute(sql, params)
    row = await cur.fetchone()
    if not row:
        raise RuntimeError("INSERT RETURNING id não retornou linha")
    key = "id" if isinstance(row, dict) else 0
    return int(as_number(row[key] if isinstance(row, dict) else row[0]))


async def _planning_id_for_key_conn(conn: AsyncConnection, plan_key: str) -> int | None:
    cur = await conn.execute("SELECT id FROM planning WHERE plan_key = $1", [plan_key])
    row = await cur.fetchone()
    if not row:
        return None
    return int(as_number(row["id"] if isinstance(row, dict) else row[0]))


async def latest_revision(plan_key: str) -> PlanningRevisionRecord | None:
    rows = await query(f"{REVISION_SQL} ORDER BY r.version DESC LIMIT 1", [plan_key])
    return _revision_of(rows[0] if rows else None)


async def revision_by_version(plan_key: str, version: int) -> PlanningRevisionRecord | None:
    rows = await query(f"{REVISION_SQL} AND r.version = $2", [plan_key, version])
    return _revision_of(rows[0] if rows else None)


async def list_revisions(plan_key: str) -> list[dict[str, object]]:
    rows = await query(
        """
        SELECT r.version, r.created_at, r.reason
        FROM planning_revision r
        JOIN planning p ON p.id = r.planning_id
        WHERE p.plan_key = $1
        ORDER BY r.version
        """,
        [plan_key],
    )
    return [
        {
            "version": int(as_number(row["version"])),
            "createdAt": as_text(row["created_at"]) or "",
            "reason": as_text(row["reason"]) or "",
        }
        for row in rows
    ]


async def load_scope(revision_id: int) -> list[PlanningScopeWrite]:
    rows = await query(
        """
        SELECT plan_id, suite_id, test_point_id, test_case_id, label
        FROM planning_scope_item WHERE revision_id = $1
        """,
        [revision_id],
    )
    return [
        {
            "plan_id": as_number_or_null(row["plan_id"]),
            "suite_id": as_number_or_null(row["suite_id"]),
            "test_point_id": as_number_or_null(row["test_point_id"]),
            "test_case_id": as_number_or_null(row["test_case_id"]),
            "label": as_text(row["label"]),
        }
        for row in rows
    ]


async def load_schedule(revision_id: int) -> list[PlanningScheduleItem]:
    items = await query(
        """
        SELECT id, suite_id, suite_name, test_point_id, test_case_id, planned_start, planned_end,
               baseline_quantity, responsavel, prioridade
        FROM planning_item WHERE revision_id = $1
        """,
        [revision_id],
    )
    allocs = await query(
        """
        SELECT a.item_id, a.alloc_date, a.planned_quantity
        FROM planning_allocation a
        JOIN planning_item i ON i.id = a.item_id
        WHERE i.revision_id = $1
        """,
        [revision_id],
    )
    by_item: dict[int, list[dict[str, object]]] = {}
    for row in allocs:
        item_id = int(as_number(row["item_id"]))
        by_item.setdefault(item_id, []).append(
            {"date": as_text(row["alloc_date"]) or "", "quantity": as_number(row["planned_quantity"])}
        )
    out: list[PlanningScheduleItem] = []
    for item in items:
        item_id = int(as_number(item["id"]))
        out.append(
            {
                "id": item_id,
                "suite_id": as_number_or_null(item.get("suite_id")),
                "suite_name": as_text(item.get("suite_name")),
                "test_point_id": as_number_or_null(item.get("test_point_id")),
                "test_case_id": as_number_or_null(item.get("test_case_id")),
                "planned_start": as_text(item.get("planned_start")),
                "planned_end": as_text(item.get("planned_end")),
                "baseline_quantity": as_number_or_null(item.get("baseline_quantity")),
                "responsavel": as_text(item.get("responsavel")),
                "prioridade": as_text(item.get("prioridade")),
                "allocations": by_item.get(item_id, []),
            }
        )
    return out


async def commit_revision(input: CommitRevisionInput) -> int:
    async def work(conn: AsyncConnection) -> int:
        cur = await conn.execute("SELECT id FROM planning WHERE plan_key = $1", [input["plan_key"]])
        existing = await cur.fetchone()
        if existing:
            planning_id = int(as_number(existing["id"] if isinstance(existing, dict) else existing[0]))
        else:
            planning_id = await _insert_returning_id(
                conn,
                "INSERT INTO planning (plan_key, created_at) VALUES ($1, $2) RETURNING id",
                [input["plan_key"], input["created_at"]],
            )
        revision_id = await _insert_returning_id(
            conn,
            """
            INSERT INTO planning_revision (planning_id, version, created_at, reason, baseline_origin, scope_snapshot)
            VALUES ($1, $2, $3, $4, $5, $6) RETURNING id
            """,
            [
                planning_id,
                input["version"],
                input["created_at"],
                input["reason"],
                input["baseline_origin"],
                input["scope_snapshot"],
            ],
        )
        for item in input.get("scope") or []:
            await conn.execute(
                """
                INSERT INTO planning_scope_item (revision_id, plan_id, suite_id, test_point_id, test_case_id, label)
                VALUES ($1, $2, $3, $4, $5, $6)
                """,
                [
                    revision_id,
                    bind(item.get("plan_id")),
                    bind(item.get("suite_id")),
                    bind(item.get("test_point_id")),
                    bind(item.get("test_case_id")),
                    bind(item.get("label")),
                ],
            )
        for item in input.get("items") or []:
            item_id = await _insert_returning_id(
                conn,
                """
                INSERT INTO planning_item (
                  revision_id, suite_id, suite_name, test_point_id, test_case_id,
                  planned_start, planned_end, baseline_quantity, responsavel, prioridade
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id
                """,
                [
                    revision_id,
                    bind(item.get("suite_id")),
                    bind(item.get("suite_name")),
                    bind(item.get("test_point_id")),
                    bind(item.get("test_case_id")),
                    bind(item.get("planned_start")),
                    bind(item.get("planned_end")),
                    bind(item.get("baseline_quantity")),
                    bind(normalize_suite_fill(item.get("responsavel"))),
                    bind(normalize_suite_fill(item.get("prioridade"))),
                ],
            )
            for alloc in item.get("allocations") or []:
                await conn.execute(
                    "INSERT INTO planning_allocation (item_id, alloc_date, planned_quantity) VALUES ($1, $2, $3)",
                    [item_id, alloc["date"], alloc["quantity"]],
                )
        return revision_id

    return await with_transaction(work)


async def _apply_cell_conn(conn: AsyncConnection, input: dict[str, object]) -> None:
    field = input["field"]
    item_id = input["item_id"]
    if field == "day":
        await conn.execute(
            "DELETE FROM planning_allocation WHERE item_id = $1 AND alloc_date = $2",
            [item_id, input["date"]],
        )
        if float(input.get("quantity") or 0) > 0:
            await conn.execute(
                "INSERT INTO planning_allocation (item_id, alloc_date, planned_quantity) VALUES ($1, $2, $3)",
                [item_id, input["date"], input["quantity"]],
            )
    elif field == "responsavel":
        await conn.execute(
            "UPDATE planning_item SET responsavel = $1 WHERE id = $2",
            [bind(normalize_suite_fill(input.get("value"))), item_id],
        )
    elif field == "prioridade":
        await conn.execute(
            "UPDATE planning_item SET prioridade = $1 WHERE id = $2",
            [bind(normalize_suite_fill(input.get("value"))), item_id],
        )
    elif field == "start":
        await conn.execute(
            "UPDATE planning_item SET planned_start = $1 WHERE id = $2",
            [bind(input.get("date")), item_id],
        )
    elif field == "end":
        await conn.execute(
            "UPDATE planning_item SET planned_end = $1 WHERE id = $2",
            [bind(input.get("date")), item_id],
        )
    else:
        raise ValueError(f"Campo de planejamento não suportado ({field!r})")


async def _apply_cell_query(input: dict[str, object]) -> None:
    field = input["field"]
    item_id = input["item_id"]
    if field == "responsavel":
        await query(
            "UPDATE planning_item SET responsavel = $1 WHERE id = $2",
            [bind(normalize_suite_fill(input.get("value"))), item_id],
        )
    elif field == "prioridade":
        await query(
            "UPDATE planning_item SET prioridade = $1 WHERE id = $2",
            [bind(normalize_suite_fill(input.get("value"))), item_id],
        )
    elif field == "start":
        await query(
            "UPDATE planning_item SET planned_start = $1 WHERE id = $2",
            [bind(input.get("date")), item_id],
        )
    elif field == "end":
        await query(
            "UPDATE planning_item SET planned_end = $1 WHERE id = $2",
            [bind(input.get("date")), item_id],
        )
    else:
        raise ValueError(f"Campo de planejamento não suportado ({field!r})")


async def _planning_id_for_key(plan_key: str) -> int | None:
    rows = await query("SELECT id FROM planning WHERE plan_key = $1", [plan_key])
    if not rows:
        return None
    return int(as_number(rows[0]["id"]))


async def _insert_change_log_conn(conn: AsyncConnection, input: PlanningChangeLogWrite) -> None:
    planning_id = await _planning_id_for_key_conn(conn, input["plan_key"])
    if planning_id is None:
        return
    created_at = datetime.now(timezone.utc).isoformat()
    await conn.execute(
        """
        INSERT INTO planning_change_log (
          planning_id, created_at, actor, suite_id, test_point_id, suite_name,
          field, alloc_date, old_value, new_value
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        """,
        [
            planning_id,
            created_at,
            bind(input.get("actor")),
            bind(input.get("suite_id")),
            bind(input.get("test_point_id")),
            bind(input.get("suite_name")),
            input["field"],
            bind(input.get("alloc_date")),
            bind(input.get("old_value")),
            bind(input.get("new_value")),
        ],
    )


async def save_cell(input: dict[str, object]) -> None:
    field = input.get("field")
    transactional = field == "day" or input.get("change_log") is not None
    if not transactional:
        await _apply_cell_query(input)
        return

    async def work(conn: AsyncConnection) -> None:
        await _apply_cell_conn(conn, input)
        if input.get("change_log"):
            await _insert_change_log_conn(conn, input["change_log"])  # type: ignore[arg-type]

    await with_transaction(work)


async def _assert_batch_conn(conn: AsyncConnection, inputs: list[dict[str, object]]) -> None:
    if any(inp.get("change_log") is None for inp in inputs):
        raise RuntimeError(BATCH_HISTORY_UNAVAILABLE)
    plan_key = next((str(inp["plan_key"]) for inp in inputs if inp.get("plan_key")), None)
    revision_id = next((inp.get("revision_id") for inp in inputs if inp.get("revision_id") is not None), None)
    if plan_key and revision_id is not None:
        latest = await latest_revision(plan_key)
        if not latest or latest["id"] != revision_id:
            raise PlanningConflictError(PlanningConflictError.baseline_revised)
    for inp in inputs:
        if revision_id is not None:
            cur = await conn.execute(
                "SELECT 1 AS ok FROM planning_item WHERE id = $1 AND revision_id = $2",
                [inp["item_id"], revision_id],
            )
            if not await cur.fetchone():
                raise PlanningConflictError(PlanningConflictError.item_out_of_revision)
        if not inp.get("guard"):
            continue
        if inp.get("field") == "day":
            cur = await conn.execute(
                "SELECT planned_quantity FROM planning_allocation WHERE item_id = $1 AND alloc_date = $2",
                [inp["item_id"], inp["date"]],
            )
            row = await cur.fetchone()
            qty = float(row["planned_quantity"] if isinstance(row, dict) else row[0]) if row else 0.0
            if abs(qty - float(inp.get("expected_quantity") or 0)) > 1e-9:
                raise PlanningConflictError(PlanningConflictError.cell_changed)
        elif inp.get("field") in ("start", "end"):
            column = "planned_start" if inp["field"] == "start" else "planned_end"
            cur = await conn.execute(f"SELECT {column} AS value FROM planning_item WHERE id = $1", [inp["item_id"]])
            row = await cur.fetchone()
            stored = (row["value"] if isinstance(row, dict) else row[0]) if row and row else ""
            stored_text = stored if stored is not None else ""
            if stored_text != (inp.get("expected_text") or ""):
                raise PlanningConflictError(PlanningConflictError.cell_changed)


async def save_cells(inputs: list[dict[str, object]]) -> None:
    if not inputs:
        return

    async def work(conn: AsyncConnection) -> None:
        await _assert_batch_conn(conn, inputs)
        for inp in inputs:
            await _apply_cell_conn(conn, inp)
            log = inp.get("change_log")
            if not log:
                raise RuntimeError(BATCH_HISTORY_UNAVAILABLE)
            if await _planning_id_for_key_conn(conn, log["plan_key"]) is None:  # type: ignore[index]
                raise RuntimeError(BATCH_HISTORY_UNAVAILABLE)
            await _insert_change_log_conn(conn, log)  # type: ignore[arg-type]

    await with_transaction(work)


async def append_change_log(input: PlanningChangeLogWrite) -> None:
    async def work(conn: AsyncConnection) -> None:
        await _insert_change_log_conn(conn, input)

    await with_transaction(work)


async def list_change_log(plan_key: str, limit: int = 300) -> list[PlanningChangeLogEntry]:
    planning_id = await _planning_id_for_key(plan_key)
    if planning_id is None:
        return []
    cap = min(max(1, limit), 1000)
    rows = await query(
        """
        SELECT id, created_at, actor, suite_id, test_point_id, suite_name, field, alloc_date, old_value, new_value
        FROM planning_change_log
        WHERE planning_id = $1
        ORDER BY created_at DESC, id DESC
        LIMIT $2
        """,
        [planning_id, cap],
    )
    return [
        {
            "id": int(as_number(row["id"])),
            "created_at": as_text(row["created_at"]) or "",
            "actor": as_text(row.get("actor")),
            "suite_id": as_number_or_null(row.get("suite_id")),
            "test_point_id": as_number_or_null(row.get("test_point_id")),
            "suite_name": as_text(row.get("suite_name")),
            "field": as_text(row["field"]) or "",
            "alloc_date": as_text(row.get("alloc_date")),
            "old_value": as_text(row.get("old_value")),
            "new_value": as_text(row.get("new_value")),
        }
        for row in rows
    ]


async def change_log_supported() -> bool:
    rows = await query(
        "SELECT 1 AS ok FROM schema_migrations WHERE version = $1",
        [PLANNING_CHANGE_LOG_VERSION],
    )
    return bool(rows)
