"""In-memory cache paging (mirrors azureCacheQuery.ts)."""

from __future__ import annotations

from fourqa.persistence.contracts import PageParams, PageResult

EXEC_SEARCH = [
    "plan_key", "plan_name", "frente", "atalho", "processo", "suite_name", "test_case_title",
    "test_case_state", "test_point_state", "outcome", "run_by", "test_case_tags",
]
FALHA_SEARCH = [
    "plan_key", "responsavel", "ambiente", "categoria", "titulo", "status", "frente", "tags",
]


def _matches(row: dict[str, object], columns: list[str], q: str) -> bool:
    needle = q.lower()
    for column in columns:
        value = row.get(column)
        if value is None:
            continue
        if needle in str(value).lower():
            return True
    return False


def _with_stable_id(row: dict[str, object], index: int) -> dict[str, object]:
    stable = row.get("test_point_id")
    if not isinstance(stable, int):
        stable = row.get("bug_id")
    if not isinstance(stable, int):
        stable = row.get("id")
    if not isinstance(stable, int):
        stable = index + 1
    return {**row, "id": stable}


def page_cached_rows(rows: list[dict[str, object]], columns: list[str], params: PageParams) -> PageResult:
    keyed = [_with_stable_id(dict(r), i) for i, r in enumerate(rows)]
    filtered = [r for r in keyed if not params.get("q") or _matches(r, columns, params["q"] or "")]
    offset = params["offset"]
    limit = params["limit"]
    return {
        "total": len(filtered),
        "limit": limit,
        "offset": offset,
        "rows": filtered[offset : offset + limit],
    }


def list_cached_rows(rows: list[dict[str, object]]) -> list[dict[str, object]]:
    return [_with_stable_id(dict(r), i) for i, r in enumerate(rows)]
