"""PostgreSQL Azure snapshot store (mirrors postgresAzureSnapshotStore.ts)."""

from __future__ import annotations

import re
from typing import Any

from psycopg import AsyncConnection

from fourqa.db.postgres.pool import as_number, as_number_or_null, as_text, bind, query, with_transaction
from fourqa.persistence.contracts import AzureSnapshot, PageParams, PageResult
from fourqa.persistence.plan_key import required_plan_key
from fourqa.types import ExecucaoRow, FalhaRow

EXECUCAO_COLUMNS = [
    "plan_key", "plan_id", "plan_name", "frente", "atalho", "processo", "suite_id", "suite_name",
    "parent_suite_id", "suite_depth", "suite_path", "dimensions_json", "test_point_id", "test_case_id",
    "test_case_title", "responsabilidade", "test_case_state", "test_point_state", "outcome",
    "date_completed", "run_by", "last_updated_date", "last_test_run_id", "last_result_id",
    "test_case_link", "test_case_tags",
]
FALHA_COLUMNS = [
    "plan_key", "responsavel", "ambiente", "categoria", "bug_id", "impacto", "frente",
    "titulo", "status", "criacao", "fechamento", "links", "tags",
]
EXEC_INT = {
    "id", "plan_id", "suite_id", "parent_suite_id", "suite_depth", "test_point_id", "test_case_id",
    "last_test_run_id", "last_result_id",
}
FALHA_INT = {"id", "bug_id"}
FALHA_REAL = {"impacto"}
EXEC_SEARCH = [
    "plan_key", "plan_name", "frente", "atalho", "processo", "suite_name", "test_case_title",
    "test_case_state", "test_point_state", "outcome", "run_by", "test_case_tags",
]
FALHA_SEARCH = [
    "plan_key", "responsavel", "ambiente", "categoria", "titulo", "status", "frente", "tags",
]
REPLACE_LOCK = "LOCK TABLE execucoes, falhas, workbook_meta IN EXCLUSIVE MODE"


def _like_param(q: str) -> str:
    return "%" + re.sub(r"([\\%_])", r"\\\1", q) + "%"


def _exec_of(row: dict[str, Any]) -> ExecucaoRow:
    out: dict[str, Any] = {}
    for key, value in row.items():
        if key in EXEC_INT:
            out[key] = as_number_or_null(value)
        else:
            out[key] = as_text(value)
    return out  # type: ignore[return-value]


def _falha_of(row: dict[str, Any]) -> FalhaRow:
    out: dict[str, Any] = {}
    for key, value in row.items():
        if key in FALHA_INT:
            out[key] = as_number_or_null(value)
        elif key in FALHA_REAL:
            out[key] = as_number_or_null(value)
        else:
            out[key] = as_text(value)
    return out  # type: ignore[return-value]


async def _insert_rows(conn: AsyncConnection, table: str, columns: list[str], rows: list[dict[str, Any]]) -> None:
    ph = ", ".join(f"${i + 1}" for i in range(len(columns)))
    sql = f"INSERT INTO {table} ({', '.join(columns)}) VALUES ({ph})"
    for row in rows:
        await conn.execute(sql, [bind(row.get(c)) for c in columns])


async def apply_azure_snapshot_on_client(conn: AsyncConnection, input: AzureSnapshot) -> None:
    await conn.execute("DELETE FROM execucoes")
    await conn.execute("DELETE FROM falhas")
    await _insert_rows(conn, "execucoes", EXECUCAO_COLUMNS, input["execucoes"])
    await _insert_rows(conn, "falhas", FALHA_COLUMNS, input["falhas"])
    for key, value in input["meta"].items():
        if key == "sync_job":
            continue
        await conn.execute(
            """
            INSERT INTO workbook_meta (key, value) VALUES ($1, $2)
            ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
            """,
            (key, value),
        )


async def replace_snapshot(input: AzureSnapshot) -> None:
    async def work(conn: AsyncConnection) -> None:
        await apply_azure_snapshot_on_client(conn, input)

    await with_transaction(work, REPLACE_LOCK)


async def list_execucoes(plan_key: str) -> list[ExecucaoRow]:
    rows = await query("SELECT * FROM execucoes WHERE plan_key = $1 ORDER BY id", [plan_key])
    return [_exec_of(r) for r in rows]


async def list_falhas(plan_key: str) -> list[FalhaRow]:
    rows = await query("SELECT * FROM falhas WHERE plan_key = $1 ORDER BY id", [plan_key])
    return [_falha_of(r) for r in rows]


async def _query_page(
    table: str,
    columns: list[str],
    params: PageParams,
    mapper: Any,
) -> PageResult:
    where = ["plan_key = $1"]
    args: list[Any] = [required_plan_key(params.get("plan_key"))]
    q = params.get("q") or ""
    if q:
        like = _like_param(q)
        parts = []
        for column in columns:
            args.append(like)
            parts.append(f"{column} ILIKE ${len(args)} ESCAPE '\\'")
        where.append(f"({' OR '.join(parts)})")
    clause = f"WHERE {' AND '.join(where)}"
    total_rows = await query(f"SELECT COUNT(*) AS n FROM {table} {clause}", args)
    total = as_number(total_rows[0].get("n", 0) if total_rows else 0)
    args.extend([params["limit"], params["offset"]])
    limit_idx = len(args) - 1
    rows = await query(
        f"SELECT * FROM {table} {clause} ORDER BY id LIMIT ${limit_idx} OFFSET ${limit_idx + 1}",
        args,
    )
    return {
        "total": int(total),
        "limit": params["limit"],
        "offset": params["offset"],
        "rows": [mapper(r) for r in rows],
    }


async def query_execucoes(params: PageParams) -> PageResult[ExecucaoRow]:
    return await _query_page("execucoes", EXEC_SEARCH, params, _exec_of)


async def query_falhas(params: PageParams) -> PageResult[FalhaRow]:
    return await _query_page("falhas", FALHA_SEARCH, params, _falha_of)


postgres_azure_snapshot_store = {
    "replace_snapshot": replace_snapshot,
    "list_execucoes": list_execucoes,
    "list_falhas": list_falhas,
    "query_execucoes": query_execucoes,
    "query_falhas": query_falhas,
    "apply_azure_snapshot_on_client": apply_azure_snapshot_on_client,
}
