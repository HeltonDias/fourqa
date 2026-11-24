"""Período do plano."""

from __future__ import annotations

import re
from datetime import date, datetime, timezone

PLAN_PERIOD_YEAR_MAX = 2100
PLAN_PERIOD_MAX_DAYS = 2000


class PlanningPeriodError(Exception):
    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.name = "PlanningPeriodError"


def plan_period_year_min(reference: datetime | None = None) -> int:
    ref = reference or datetime.now(timezone.utc)
    return ref.year


def _pad2(n: int) -> str:
    return str(n).zfill(2)


def _is_real_utc_date(year: int, month: int, day: int) -> bool:
    try:
        date(year, month, day)
        return True
    except ValueError:
        return False


def parse_calendar_day(value: str, reference: datetime | None = None) -> str | None:
    trimmed = value.strip()
    if not trimmed:
        return None
    year_min = plan_period_year_min(reference)

    iso = re.match(r"^(\d{4})-(\d{2})-(\d{2})", trimmed)
    if iso:
        year = int(iso.group(1))
        month = int(iso.group(2))
        day = int(iso.group(3))
        if year < year_min or year > PLAN_PERIOD_YEAR_MAX:
            return None
        if not _is_real_utc_date(year, month, day):
            return None
        return f"{iso.group(1)}-{iso.group(2)}-{iso.group(3)}"

    br = re.match(r"^(\d{2})/(\d{2})/(\d{4})$", trimmed)
    if br:
        year = int(br.group(3))
        month = int(br.group(2))
        day = int(br.group(1))
        if year < year_min or year > PLAN_PERIOD_YEAR_MAX:
            return None
        if not _is_real_utc_date(year, month, day):
            return None
        return f"{br.group(3)}-{_pad2(month)}-{_pad2(day)}"

    return None


def planning_period_invalid_message(reference: datetime | None = None) -> str:
    year_min = plan_period_year_min(reference)
    return (
        f"Período inválido. Use datas de {year_min} em diante (até {PLAN_PERIOD_YEAR_MAX}) "
        "no formato aaaa-mm-dd."
    )


def calendar_day_span_inclusive(start_iso: str, end_iso: str) -> int:
    start = parse_calendar_day(start_iso)
    end = parse_calendar_day(end_iso)
    if not start or not end or start > end:
        return 0
    sy, sm, sd = (int(x) for x in start.split("-"))
    ey, em, ed = (int(x) for x in end.split("-"))
    t0 = datetime(sy, sm, sd, tzinfo=timezone.utc).timestamp()
    t1 = datetime(ey, em, ed, tzinfo=timezone.utc).timestamp()
    return int((t1 - t0) // 86400) + 1


def assert_planning_period(
    inicio: str,
    fim: str,
    reference: datetime | None = None,
) -> dict[str, str]:
    start = parse_calendar_day(inicio, reference)
    end = parse_calendar_day(fim, reference)
    if not start or not end:
        raise PlanningPeriodError(planning_period_invalid_message(reference))
    if start > end:
        raise PlanningPeriodError("A data de início não pode ser posterior à data de fim.")
    span = calendar_day_span_inclusive(start, end)
    if span > PLAN_PERIOD_MAX_DAYS:
        raise PlanningPeriodError(
            f"Período muito longo ({span} dias). O máximo permitido é {PLAN_PERIOD_MAX_DAYS} dias."
        )
    return {"inicio": start, "fim": end}


def assert_stored_planning_period(inicio: str | None, fim: str | None) -> None:
    a = (inicio or "").strip()
    b = (fim or "").strip()
    if not a or not b:
        return
    assert_planning_period(a, b)


def assert_date_range_for_calculation(inicio: datetime, fim: datetime) -> None:
    if fim.timestamp() < inicio.timestamp():
        raise PlanningPeriodError("Intervalo de datas inválido para cálculo.")
    allowed_min = plan_period_year_min()
    year_min = inicio.year
    year_max = fim.year
    if year_min < allowed_min or year_max > PLAN_PERIOD_YEAR_MAX:
        raise PlanningPeriodError(planning_period_invalid_message())
    span_days = int((fim.timestamp() - inicio.timestamp()) // 86400) + 1
    if span_days > PLAN_PERIOD_MAX_DAYS:
        raise PlanningPeriodError(
            f"Intervalo muito longo para cálculo ({span_days} dias). Máximo: {PLAN_PERIOD_MAX_DAYS} dias."
        )
