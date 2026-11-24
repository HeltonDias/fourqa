"""Fingerprint de cronograma."""

from __future__ import annotations

from fourqa.persistence.contracts import PlanningScheduleItem


def _num(n: float | int | None) -> str:
    if n is None or not isinstance(n, (int, float)) or n != n:
        return ""
    return str(n)


def schedule_fingerprint(items: list[PlanningScheduleItem]) -> str:
    lines: list[str] = []
    for item in sorted(items, key=lambda row: row["id"]):
        lines.append(
            "\t".join(
                [
                    str(item["id"]),
                    str(item.get("suite_id")),
                    str(item.get("test_point_id")),
                    str(item.get("test_case_id")),
                    item.get("planned_start") or "",
                    item.get("planned_end") or "",
                    item.get("responsavel") or "",
                    item.get("prioridade") or "",
                    _num(item.get("baseline_quantity")),
                    item.get("suite_name") or "",
                ]
            )
        )
        allocs = sorted(
            item.get("allocations") or [],
            key=lambda a: (a["date"], a["quantity"]),
        )
        for alloc in allocs:
            lines.append(f"{alloc['date']}={_num(alloc['quantity'])}")
    return "\n".join(lines) + "\n"
