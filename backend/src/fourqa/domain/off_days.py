"""Feriados e fins de semana."""

from __future__ import annotations

from datetime import datetime

import holidays

from fourqa.domain.planning import calendar_date

_br_holidays = holidays.country_holidays("BR")


def _at_noon(iso: str) -> datetime | None:
    day = calendar_date(iso)
    if not day:
        return None
    year, month, date = (int(x) for x in day.split("-"))
    return datetime(year, month, date, 12, 0, 0)


def holiday_name(iso: str) -> str | None:
    dt = _at_noon(iso)
    if not dt:
        return None
    hits = _br_holidays.get(dt.date())
    if not hits:
        return None
    return str(hits)


def is_holiday_date(iso: str) -> bool:
    return holiday_name(iso) is not None


def is_weekend_date(iso: str) -> bool:
    day = calendar_date(iso)
    if not day:
        return False
    year, month, date = (int(x) for x in day.split("-"))
    week = datetime(year, month, date).weekday()
    return week >= 5


def is_off_day(iso: str) -> bool:
    return is_weekend_date(iso) or is_holiday_date(iso)
