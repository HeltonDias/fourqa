"""Planning cell optimistic base."""

from __future__ import annotations

from typing import Literal, TypedDict

PlanningCellField = Literal["start", "end", "day", "responsavel", "prioridade"]


class CellBaseRead(TypedDict):
    guard: bool
    expected_text: str | None
    expected_quantity: float


def parse_planning_cell_base(body: dict[str, object], field: PlanningCellField) -> CellBaseRead | None:
    if field == "day":
        if "baseQuantity" not in body:
            return {"guard": False, "expected_text": None, "expected_quantity": 0}
        q = body["baseQuantity"]
        if not isinstance(q, (int, float)) or q != q or q < 0:  # NaN check via q != q
            return None
        return {"guard": True, "expected_text": None, "expected_quantity": float(q)}
    if field in ("start", "end"):
        if "baseDate" not in body:
            return {"guard": False, "expected_text": None, "expected_quantity": 0}
        d = body["baseDate"]
        if d is not None and not isinstance(d, str):
            return None
        return {"guard": True, "expected_text": d, "expected_quantity": 0}
    if "baseValue" not in body:
        return {"guard": False, "expected_text": None, "expected_quantity": 0}
    v = body["baseValue"]
    if v is not None and not isinstance(v, str):
        return None
    return {"guard": True, "expected_text": v, "expected_quantity": 0}
