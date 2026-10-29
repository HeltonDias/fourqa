"""Plan key parsing (mirrors backend/src/persistence/planKey.ts)."""

from __future__ import annotations

import re

_CONTROL = re.compile(r"[\u0000-\u001f\u007f]")


def required_plan_key(plan_key: str | None) -> str:
    key = plan_key.strip() if isinstance(plan_key, str) else ""
    if not key:
        raise ValueError("planKey obrigatório")
    return key


def plan_key_from_raw(q: object, fallback: str) -> str:
    if isinstance(q, str) and q.strip():
        return q.strip()
    return required_plan_key(fallback)


def explicit_plan_key_from_query(q: object) -> str | None:
    if q is None:
        return None
    if isinstance(q, list):
        if len(q) != 1:
            return None
        q = q[0]
    if not isinstance(q, str):
        return None
    trimmed = q.strip()
    if not trimmed:
        return None
    if _CONTROL.search(trimmed):
        return None
    return trimmed


def plan_key_write_error(q: object) -> str:
    if isinstance(q, list) and len(q) > 1:
        return "planKey ambíguo."
    if isinstance(q, str) and _CONTROL.search(q):
        return "planKey inválido."
    return "Informe o planKey."
