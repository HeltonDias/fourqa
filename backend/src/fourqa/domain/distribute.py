"""Distribuição de planejamento (mirrors backend/src/domain/distribute.ts)."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Literal, TypedDict

from fourqa.domain.off_days import is_off_day, is_weekend_date
from fourqa.domain.planning import calendar_date, dates_between

DISTRIBUTION_STRATEGIES = ("montanha", "decrescente", "crescente", "uniforme")
DistributionStrategy = Literal["montanha", "decrescente", "crescente", "uniforme"]
DISTRIBUTION_ASSIGNMENT = "manter"


def is_distribution_strategy(value: str) -> bool:
    return value in DISTRIBUTION_STRATEGIES


def shift_calendar_day(iso: str, delta: int) -> str | None:
    day = calendar_date(iso)
    if not day or not isinstance(delta, int):
        return None
    year, month, date = (int(x) for x in day.split("-"))
    cursor = datetime(year, month, date) + timedelta(days=delta)
    return cursor.strftime("%Y-%m-%d")


def distribution_days(start: str, end: str, resguardo: int, enabled_off_days: set[str]) -> list[str]:
    if not isinstance(resguardo, int) or resguardo < 0:
        return []
    last = shift_calendar_day(end, -resguardo)
    if not last:
        return []
    return [day for day in dates_between(start, last) if not is_off_day(day) or day in enabled_off_days]


def _weights_for(count: int, strategy: DistributionStrategy) -> list[int]:
    if strategy == "uniforme":
        return [1] * count
    if strategy == "decrescente":
        return [count - index for index in range(count)]
    if strategy == "crescente":
        return [index + 1 for index in range(count)]
    return [min(index, count - 1 - index) + 1 for index in range(count)]


def _allocate_by_remainder(total: int, weights: list[int]) -> list[int]:
    count = len(weights)
    out = [0] * count
    if count == 0 or total <= 0:
        return out
    weight_sum = sum(weights)
    pending: list[tuple[int, float, int]] = []
    used = 0
    for index, weight in enumerate(weights):
        quota = total * weight
        floor = quota // weight_sum
        out[index] = floor
        used += floor
        pending.append((index, quota % weight_sum, weight))
    pending.sort(key=lambda row: (-row[1], -row[2], row[0]))
    left = total - used
    for index in range(len(pending)):
        if left <= 0:
            break
        out[pending[index][0]] += 1
        left -= 1
    return out


def _fill_zeros(quantities: list[int], total: int) -> list[int]:
    if total < len(quantities):
        return quantities
    out = quantities[:]
    while any(value == 0 for value in out):
        hole = next((i for i, v in enumerate(out) if v == 0), -1)
        donor = -1
        for index, value in enumerate(out):
            if value <= 1:
                continue
            if donor < 0 or value > out[donor] or (value == out[donor] and index > donor):
                donor = index
        if hole < 0 or donor < 0:
            break
        out[donor] -= 1
        out[hole] += 1
    return out


def spread_quantity(total: int, day_count: int, strategy: DistributionStrategy) -> list[int]:
    if day_count <= 0:
        return []
    if not isinstance(total, int) or total <= 0:
        return [0] * day_count
    if day_count == 1:
        return [total]
    spread = _allocate_by_remainder(total, _weights_for(day_count, strategy))
    return _fill_zeros(spread, total)


class AllocationDelta(TypedDict):
    date: str
    quantity: int
    previous: int


class DistributionMode(TypedDict, total=False):
    replace: bool
    total: int | None


def _taken_quantity(allocations: list[dict[str, object]]) -> dict[str, int]:
    previous: dict[str, int] = {}
    for row in allocations:
        day = calendar_date(str(row.get("date", "")))
        qty = row.get("quantity")
        if not day or not isinstance(qty, (int, float)) or qty == 0:
            continue
        previous[day] = previous.get(day, 0) + int(qty)
    return previous


def _deltas_from(previous: dict[str, int], next_map: dict[str, int]) -> list[AllocationDelta]:
    dates = set(previous) | set(next_map)
    deltas: list[AllocationDelta] = []
    for date in sorted(dates):
        before = previous.get(date, 0)
        quantity = next_map.get(date, 0)
        if before == quantity:
            continue
        deltas.append({"date": date, "quantity": quantity, "previous": before})
    return deltas


def is_planning_finalized(classification: str) -> bool:
    return classification in ("passed", "na")


def count_planning_balance(classifications: list[str]) -> dict[str, int]:
    scope = len(classifications)
    finalized = sum(1 for c in classifications if is_planning_finalized(c))
    return {"scope": scope, "finalized": finalized, "pending": scope - finalized}


def quantity_outside_days(allocations: list[dict[str, object]], days: list[str]) -> int:
    window = set(days)
    total = 0
    for row in allocations:
        day = calendar_date(str(row.get("date", "")))
        if not day or day in window:
            continue
        qty = row.get("quantity")
        if isinstance(qty, (int, float)) and qty > 0:
            total += int(qty)
    return total


def quantity_before_cut(allocations: list[dict[str, object]], cut: str) -> int:
    limit = calendar_date(cut)
    if not limit:
        return 0
    total = 0
    for row in allocations:
        day = calendar_date(str(row.get("date", "")))
        qty = row.get("quantity")
        if day and day < limit and isinstance(qty, (int, float)) and qty > 0:
            total += int(qty)
    return total


def saldo_deltas(
    allocations: list[dict[str, object]],
    days: list[str],
    strategy: DistributionStrategy,
    mode: dict[str, object],
) -> list[AllocationDelta] | None:
    pending = mode.get("pending")
    if not isinstance(pending, int) or pending < 0:
        raise ValueError("Saldo pendente inválido.")
    protected = mode.get("protected_quantity")
    protected_quantity = protected if isinstance(protected, int) and protected > 0 else 0
    to_place = max(0, pending - protected_quantity)
    window_rows = [
        row
        for row in allocations
        if (d := calendar_date(str(row.get("date", "")))) is not None and d in days
    ]
    if pending == 0:
        return None
    replace = bool(mode.get("replace"))
    if to_place == 0:
        if not replace:
            return []
        previous = _taken_quantity(window_rows)
        return [{"date": date, "quantity": 0, "previous": quantity} for date, quantity in previous.items() if quantity > 0]
    return allocation_deltas(window_rows, days, strategy, {"replace": replace, "total": to_place})


def trim_allocations_to_keep(allocations: list[dict[str, object]], keep: int) -> list[AllocationDelta]:
    if not isinstance(keep, int) or keep < 0:
        raise ValueError("Quantidade finalizada inválida.")
    by_date: dict[str, int] = {}
    for row in allocations:
        day = calendar_date(str(row.get("date", "")))
        qty = row.get("quantity")
        if not day or not isinstance(qty, (int, float)) or qty <= 0:
            continue
        by_date[day] = by_date.get(day, 0) + int(qty)
    dates = sorted(by_date)
    total = sum(by_date.values())
    excess = total - keep
    if excess <= 0:
        return []
    deltas: list[AllocationDelta] = []
    for index in range(len(dates) - 1, -1, -1):
        if excess <= 0:
            break
        date = dates[index]
        previous = by_date[date]
        cut = min(previous, excess)
        deltas.append({"date": date, "quantity": previous - cut, "previous": previous})
        excess -= cut
    return deltas


def allocation_deltas(
    allocations: list[dict[str, object]],
    days: list[str],
    strategy: DistributionStrategy,
    mode: DistributionMode | None = None,
) -> list[AllocationDelta] | None:
    previous = _taken_quantity(allocations)
    allocated = sum(previous.values())
    requested = mode.get("total") if mode else None
    target = requested if isinstance(requested, int) and requested > 0 else allocated
    if target == 0:
        return None
    if not isinstance(target, int) or target < 0:
        raise ValueError("Quantidade planejada inválida.")
    replace = mode["replace"] if mode else True
    if not replace:
        free_days = [day for day in days if previous.get(day, 0) == 0]
        locked = sum(previous.values())
        remainder = max(0, target - locked)
        if remainder == 0:
            return []
        if not free_days:
            raise ValueError("Não há dia em zero nesse período.")
        spread = spread_quantity(remainder, len(free_days), strategy)
        next_map = dict(previous)
        for day, qty in zip(free_days, spread, strict=False):
            next_map[day] = qty
        return _deltas_from(previous, next_map)
    spread = spread_quantity(target, len(days), strategy)
    next_map = {day: spread[index] if index < len(spread) else 0 for index, day in enumerate(days)}
    return _deltas_from(previous, next_map)


class DistributionShare(TypedDict, total=False):
    key: str
    total: int
    allocations: list[dict[str, object]]
    clear_window: bool


def _deal_days(
    quotas: list[dict[str, object]],
    days: list[str],
    curve: list[int],
) -> dict[str, dict[str, int]]:
    left = {str(row["key"]): int(row["quota"]) for row in quotas}
    out: dict[str, dict[str, int]] = {}
    order = sorted(quotas, key=lambda row: str(row["key"]))
    for index, day in enumerate(days):
        need = curve[index] if index < len(curve) else 0
        if not day or need <= 0:
            continue
        while need > 0:
            pick = None
            best = 0
            for row in order:
                key = str(row["key"])
                remaining = left.get(key, 0)
                if remaining > best:
                    best = remaining
                    pick = key
            if not pick or best <= 0:
                break
            cells = out.setdefault(pick, {})
            cells[day] = cells.get(day, 0) + 1
            left[pick] = best - 1
            need -= 1
    return out


def apportion_distribution(
    shares: list[DistributionShare],
    days: list[str],
    strategy: DistributionStrategy,
    replace: bool,
) -> dict[str, list[AllocationDelta]]:
    seen: set[str] = set()
    for share in shares:
        if share["key"] in seen:
            raise ValueError("Suíte repetida na distribuição.")
        seen.add(share["key"])
        if not isinstance(share["total"], int) or share["total"] < 0:
            raise ValueError("Quantidade planejada inválida.")
    result: dict[str, list[AllocationDelta]] = {}
    active: list[tuple[DistributionShare, dict[str, int]]] = []
    for share in shares:
        previous = _taken_quantity(share.get("allocations") or [])
        if share["total"] == 0:
            if not share.get("clear_window"):
                continue
            if not replace:
                result[share["key"]] = []
                continue
            next_map = dict(previous)
            for day in days:
                next_map[day] = 0
            result[share["key"]] = _deltas_from(previous, next_map)
            continue
        active.append((share, previous))
    curve_total = sum(row[0]["total"] for row in active)
    if len(days) == 0:
        if curve_total > 0:
            raise ValueError("Nenhum dia habilitado nesse período.")
        return result
    if replace:
        curve = spread_quantity(curve_total, len(days), strategy) if curve_total > 0 else []
        dealt = _deal_days([{"key": s["key"], "quota": s["total"]} for s, _ in active], days, curve)
        for share, previous in active:
            assigned = dealt.get(share["key"], {})
            next_map = {day: assigned.get(day, 0) for day in days}
            result[share["key"]] = _deltas_from(previous, next_map)
        return result
    remainders: list[dict[str, object]] = []
    for share, previous in active:
        locked = sum(previous.values())
        quota = max(0, share["total"] - locked)
        remainders.append({"key": share["key"], "quota": quota, "previous": previous})
    remainder_total = sum(int(r["quota"]) for r in remainders)
    if remainder_total == 0:
        for row in remainders:
            result[str(row["key"])] = []
        return result
    occupied: set[str] = set()
    for share in shares:
        for day, quantity in _taken_quantity(share.get("allocations") or []).items():
            if quantity > 0:
                occupied.add(day)
    free_days = [day for day in days if day not in occupied]
    if not free_days:
        raise ValueError("Não há dia em zero nesse período.")
    curve = spread_quantity(remainder_total, len(free_days), strategy)
    dealt = _deal_days(
        [{"key": r["key"], "quota": r["quota"]} for r in remainders if int(r["quota"]) > 0],
        free_days,
        curve,
    )
    for row in remainders:
        assigned = dealt.get(str(row["key"]), {})
        previous = row["previous"]  # type: ignore[assignment]
        next_map = dict(previous)  # type: ignore[arg-type]
        for day in free_days:
            add = assigned.get(day, 0)
            if add > 0:
                next_map[day] = previous.get(day, 0) + add  # type: ignore[union-attr]
        result[str(row["key"])] = _deltas_from(previous, next_map)  # type: ignore[arg-type]
    return result


__all__ = ["is_weekend_date"]
