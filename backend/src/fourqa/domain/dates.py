"""Persistência de data/hora."""

from __future__ import annotations

from datetime import datetime, timezone

from fourqa.domain.plan_period import parse_calendar_day


def persist_timestamp(value: object) -> str:
    if value is None:
        return ""
    s = str(value).strip()
    if not s:
        return ""

    import re

    iso_head = re.match(r"^(\d{4}-\d{2}-\d{2})", s)
    if iso_head:
        cal = parse_calendar_day(iso_head.group(1))
        if cal:
            return cal
        return ""

    br = parse_calendar_day(s)
    if br:
        return br

    try:
        parsed = datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        return s
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.isoformat().replace("+00:00", "Z") if s.endswith("Z") else parsed.isoformat()
