"""Pagination query (mirrors backend/src/http/pageQuery.ts)."""

from __future__ import annotations

from typing import Any, TypedDict


class PageQuery(TypedDict):
    limit: int
    offset: int
    q: str


PAGE_MIN = 1
PAGE_MAX = 200


def parse_page_query(query: dict[str, Any]) -> PageQuery:
    limit_raw = query.get("limit")
    limit = min(PAGE_MAX, max(PAGE_MIN, int(float(limit_raw)) if limit_raw is not None else 50))
    offset_raw = query.get("offset")
    offset = max(0, int(float(offset_raw)) if offset_raw is not None else 0)
    q_raw = query.get("q")
    q = q_raw.strip()[:200] if isinstance(q_raw, str) else ""
    return {"limit": limit, "offset": offset, "q": q}
