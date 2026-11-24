"""Progresso planejamento."""

from __future__ import annotations

import re
from datetime import datetime, timezone

from fourqa.domain.graficos import business_days
from fourqa.domain.plan_period import assert_stored_planning_period, parse_calendar_day
from fourqa.domain.formulas import status_cenario
from fourqa.types import ExecucaoRow, GraficoPontoDiaDetalhado, PlanningProgressSnapshot, ProgressSituacao


def _to_date_only(v: str | None) -> datetime | None:
    if not v:
        return None
    s = str(v).strip()
    head = re.match(r"^(\d{4}-\d{2}-\d{2})", s)
    cal = parse_calendar_day(head.group(1) if head else s)
    if not cal:
        return None
    y, m, d = (int(x) for x in cal.split("-"))
    return datetime(y, m, d, tzinfo=timezone.utc)


def _iso_day(d: datetime) -> str:
    return d.strftime("%Y-%m-%d")


def _add_days(d: datetime, n: int) -> datetime:
    return datetime.fromtimestamp(d.timestamp() + n * 86400, tz=timezone.utc)


def _is_realizado(e: ExecucaoRow, plan_key: str) -> bool:
    if (e.get("plan_key") or "").strip() != plan_key:
        return False
    s = status_cenario(e)
    return s in ("passed", "na")


def sum_allocations_by_day(allocations: list[dict[str, int]]) -> dict[str, int]:
    plan_por_dia: dict[str, int] = {}
    for amap in allocations:
        for day, qty in amap.items():
            head = re.match(r"^(\d{4}-\d{2}-\d{2})", day)
            k = parse_calendar_day(head.group(1) if head else day) or day
            n = int(qty) if qty else 0
            if n == 0:
                continue
            plan_por_dia[k] = plan_por_dia.get(k, 0) + n
    return plan_por_dia


def situacao_progresso(planejado: float, realizado: float) -> ProgressSituacao:
    if realizado > planejado:
        return "adiantado"
    if realizado < planejado:
        return "atrasado"
    return "dentro"


def planejado_vs_realizado_from_allocations(
    plan_por_dia_input: dict[str, int],
    exec_rows: list[ExecucaoRow],
    plan_key: str,
    periodo: dict[str, str],
    hoje: datetime | None = None,
) -> list[GraficoPontoDiaDetalhado]:
    assert_stored_planning_period(periodo.get("inicio"), periodo.get("fim"))
    inicio = _to_date_only(periodo.get("inicio"))
    fim = _to_date_only(periodo.get("fim"))
    if not inicio or not fim or fim.timestamp() < inicio.timestamp():
        return []
    eixo = business_days(inicio, fim)
    if not eixo:
        return []
    plan_por_dia = {_iso_day(d): 0 for d in eixo}
    for day, qty in plan_por_dia_input.items():
        if day in plan_por_dia:
            plan_por_dia[day] += qty
    real_por_dia: dict[str, int] = {}
    for e in exec_rows:
        if not _is_realizado(e, plan_key):
            continue
        d = _to_date_only(e.get("date_completed")) or _to_date_only(e.get("last_updated_date"))
        if not d:
            continue
        k = _iso_day(d)
        real_por_dia[k] = real_por_dia.get(k, 0) + 1
    primeiro = _iso_day(eixo[0])
    real_antes = sum(v for k, v in real_por_dia.items() if k < primeiro)
    ref = hoje or datetime.now(timezone.utc)
    hoje_key = _iso_day(datetime(ref.year, ref.month, ref.day, tzinfo=timezone.utc))
    acc_plan = 0
    acc_real = real_antes
    pontos: list[GraficoPontoDiaDetalhado] = []
    cursor = eixo[0]
    for d in eixo:
        k = _iso_day(d)
        planejado_dia = plan_por_dia.get(k, 0)
        acc_plan += planejado_dia
        realizado_dia = 0
        x = cursor
        while x.timestamp() <= d.timestamp():
            realizado_dia += real_por_dia.get(_iso_day(x), 0)
            x = _add_days(x, 1)
        acc_real += realizado_dia
        cursor = _add_days(d, 1)
        pontos.append(
            {
                "data": k,
                "planejado_dia": planejado_dia,
                "realizado_dia": realizado_dia,
                "planejado": round(acc_plan * 10) / 10,
                "realizado": acc_real if k <= hoje_key else None,
            }
        )
    return pontos


def snapshot_progresso(
    serie: list[GraficoPontoDiaDetalhado],
    hoje: datetime | None = None,
) -> PlanningProgressSnapshot | None:
    if not serie:
        return None
    ref = hoje or datetime.now(timezone.utc)
    hoje_key = _iso_day(datetime(ref.year, ref.month, ref.day, tzinfo=timezone.utc))
    ponto = serie[0]
    for row in serie:
        if row["data"] <= hoje_key:
            ponto = row
        else:
            break
    planejado_ate_hoje = round(ponto["planejado"])
    realizado_ate_hoje = ponto["realizado"] or 0
    diferenca = realizado_ate_hoje - planejado_ate_hoje
    return {
        "serie": serie,
        "planejado_ate_hoje": planejado_ate_hoje,
        "realizado_ate_hoje": realizado_ate_hoje,
        "diferenca": diferenca,
        "situacao": situacao_progresso(planejado_ate_hoje, realizado_ate_hoje),
    }
