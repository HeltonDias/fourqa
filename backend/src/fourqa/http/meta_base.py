"""Meta pair base parsing (mirrors backend/src/http/metaBase.ts)."""

from __future__ import annotations

from typing import TypedDict


class PairBase(TypedDict):
    present: bool
    valid: bool
    a: str
    b: str


def parse_meta_pair(body: dict[str, object], key_a: str, key_b: str) -> PairBase:
    has_a = key_a in body
    has_b = key_b in body
    if not has_a and not has_b:
        return {"present": False, "valid": True, "a": "", "b": ""}
    va = body.get(key_a)
    vb = body.get(key_b)
    if isinstance(va, str) and isinstance(vb, str):
        return {"present": True, "valid": True, "a": va, "b": vb}
    return {"present": True, "valid": False, "a": "", "b": ""}
