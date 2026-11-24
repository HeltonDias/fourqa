"""Pagination query."""

from __future__ import annotations

from typing import Any

from fourqa.persistence.contracts import PageParams

PAGE_MIN = 1
PAGE_MAX = 200
PAGE_DEFAULT = 50


def _int_or(raw: Any, default: int) -> int:
    if raw is None:
        return default
    try:
        return int(float(raw))
    except (TypeError, ValueError, OverflowError):
        return default


def parse_page_query(query: dict[str, Any], plan_key: str) -> PageParams:
    limit = min(PAGE_MAX, max(PAGE_MIN, _int_or(query.get("limit"), PAGE_DEFAULT)))
    offset = max(0, _int_or(query.get("offset"), 0))
    q_raw = query.get("q")
    q = q_raw.strip()[:200] if isinstance(q_raw, str) else ""
    return {"plan_key": plan_key, "limit": limit, "offset": offset, "q": q}
