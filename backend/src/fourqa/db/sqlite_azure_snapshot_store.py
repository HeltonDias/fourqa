"""SQLite Azure snapshot store (mirrors backend/src/db/sqliteAzureSnapshotStore.ts)."""

from __future__ import annotations

import re

from fourqa.db.db import get_db
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
EXEC_SEARCH = [
    "plan_key", "plan_name", "frente", "atalho", "processo", "suite_name", "test_case_title",
    "test_case_state", "test_point_state", "outcome", "run_by", "test_case_tags",
]
FALHA_SEARCH = [
    "plan_key", "responsavel", "ambiente", "categoria", "titulo", "status", "frente", "tags",
]


def _like_param(q: str) -> str:
    return "%" + re.sub(r"([\\%_])", r"\\\1", q) + "%"


def replace_snapshot(input: AzureSnapshot) -> None:
    db = get_db()
    db.execute("BEGIN IMMEDIATE")
    try:
        db.execute("DELETE FROM execucoes")
        db.execute("DELETE FROM falhas")
        exec_ph = ", ".join("?" for _ in EXECUCAO_COLUMNS)
        ins_exec = db.execute(
            f"INSERT INTO execucoes ({', '.join(EXECUCAO_COLUMNS)}) VALUES ({exec_ph})",
            [],
        )
        del ins_exec
        stmt_exec = f"INSERT INTO execucoes ({', '.join(EXECUCAO_COLUMNS)}) VALUES ({exec_ph})"
        for row in input["execucoes"]:
            db.execute(stmt_exec, [row.get(c) for c in EXECUCAO_COLUMNS])
        stmt_falha = f"INSERT INTO falhas ({', '.join(FALHA_COLUMNS)}) VALUES ({', '.join('?' for _ in FALHA_COLUMNS)})"
        for row in input["falhas"]:
            db.execute(stmt_falha, [row.get(c) for c in FALHA_COLUMNS])
        for k, v in input["meta"].items():
            db.execute("INSERT OR REPLACE INTO workbook_meta (key, value) VALUES (?, ?)", (k, v))
        db.commit()
    except Exception:
        db.rollback()
        raise


def list_execucoes(plan_key: str) -> list[ExecucaoRow]:
    rows = get_db().execute(
        "SELECT * FROM execucoes WHERE plan_key = ? ORDER BY id", (plan_key,)
    ).fetchall()
    return [dict(r) for r in rows]  # type: ignore[misc]


def list_falhas(plan_key: str) -> list[FalhaRow]:
    rows = get_db().execute("SELECT * FROM falhas WHERE plan_key = ? ORDER BY id", (plan_key,)).fetchall()
    return [dict(r) for r in rows]  # type: ignore[misc]


def _query_page(table: str, columns: list[str], params: PageParams) -> PageResult:
    where = ["plan_key = ?"]
    args: list[object] = [required_plan_key(params.get("plan_key"))]
    q = params.get("q") or ""
    if q:
        where.append("(" + " OR ".join(f"{c} LIKE ? ESCAPE '\\'" for c in columns) + ")")
        like = _like_param(q)
        args.extend([like] * len(columns))
    clause = f"WHERE {' AND '.join(where)}"
    total = get_db().execute(f"SELECT COUNT(*) AS n FROM {table} {clause}", args).fetchone()[0]
    rows = get_db().execute(
        f"SELECT * FROM {table} {clause} ORDER BY id LIMIT ? OFFSET ?",
        [*args, params["limit"], params["offset"]],
    ).fetchall()
    return {
        "total": int(total),
        "limit": params["limit"],
        "offset": params["offset"],
        "rows": [dict(r) for r in rows],
    }


def query_execucoes(params: PageParams) -> PageResult[ExecucaoRow]:
    return _query_page("execucoes", EXEC_SEARCH, params)


def query_falhas(params: PageParams) -> PageResult[FalhaRow]:
    return _query_page("falhas", FALHA_SEARCH, params)


sqlite_azure_snapshot_store = {
    "replace_snapshot": replace_snapshot,
    "list_execucoes": list_execucoes,
    "list_falhas": list_falhas,
    "query_execucoes": query_execucoes,
    "query_falhas": query_falhas,
}
