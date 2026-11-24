"""Gráficos Home."""

from __future__ import annotations

from collections.abc import Mapping

import re
from datetime import datetime, timezone

from fourqa.domain.formulas import status_cenario
from fourqa.domain.plan_period import assert_date_range_for_calculation, assert_stored_planning_period, parse_calendar_day
from fourqa.types import ExecucaoRow, GraficoFatia, GraficoPontoDia, PlanejamentoLinha


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


def _is_business_day(d: datetime) -> bool:
    return d.weekday() < 5


def business_days(inicio: datetime, fim: datetime) -> list[datetime]:
    assert_date_range_for_calculation(inicio, fim)
    out: list[datetime] = []
    cursor = inicio
    while cursor.timestamp() <= fim.timestamp():
        if _is_business_day(cursor):
            out.append(cursor)
        cursor = _add_days(cursor, 1)
    return out


def _is_realizado(e: ExecucaoRow, plan_key: str) -> bool:
    if (e.get("plan_key") or "").strip() != plan_key:
        return False
    s = status_cenario(e)
    return s in ("passed", "na")


def planejado_ate_hoje(
    qtd: float,
    inicio: str | None,
    fim: str | None,
    hoje: datetime | None = None,
) -> float:
    ini = _to_date_only(inicio)
    end = _to_date_only(fim)
    if not qtd or not ini or not end:
        return 0
    ref = hoje or datetime.now(timezone.utc)
    hoje_utc = datetime(ref.year, ref.month, ref.day, tzinfo=timezone.utc)
    dias = business_days(ini, end)
    if not dias:
        return qtd if hoje_utc.timestamp() >= ini.timestamp() else 0
    decorridos = sum(1 for d in dias if d.timestamp() <= hoje_utc.timestamp())
    return round((qtd * decorridos) / len(dias))


def planejado_vs_realizado(
    linhas: list[PlanejamentoLinha],
    exec_rows: list[ExecucaoRow],
    plan_key: str,
    periodo: dict[str, str],
    hoje: datetime | None = None,
) -> list[GraficoPontoDia]:
    assert_stored_planning_period(periodo.get("inicio"), periodo.get("fim"))
    suites = [l for l in linhas if l.get("processo") and (float(l.get("qtd_cts_plan") or 0) > 0)]
    inicios = [d for l in suites if (d := _to_date_only(l.get("data_inicio")))]
    fins = [d for l in suites if (d := _to_date_only(l.get("data_fim")))]
    inicio = _to_date_only(periodo.get("inicio")) or (min(inicios, key=lambda d: d.timestamp()) if inicios else None)
    fim_candidates = [d for d in [_to_date_only(periodo.get("fim")), *fins] if d]
    fim = max(fim_candidates, key=lambda d: d.timestamp()) if fim_candidates else None
    if not inicio or not fim or fim.timestamp() < inicio.timestamp():
        return []
    eixo = business_days(inicio, fim)
    if not eixo:
        return []
    plan_por_dia = {_iso_day(d): 0.0 for d in eixo}
    for s in suites:
        plan = float(s.get("qtd_cts_plan") or 0)
        s_ini = _to_date_only(s.get("data_inicio")) or inicio
        s_fim = _to_date_only(s.get("data_fim")) or fim
        dias = business_days(s_ini, s_fim)
        if not dias:
            k = _iso_day(eixo[0])
            plan_por_dia[k] = plan_por_dia.get(k, 0) + plan
            continue
        por_dia = plan / len(dias)
        for d in dias:
            k = _iso_day(d)
            if k in plan_por_dia:
                plan_por_dia[k] += por_dia
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
    acc_plan = 0.0
    acc_real = real_antes
    pontos: list[GraficoPontoDia] = []
    cursor = eixo[0]
    for d in eixo:
        acc_plan += plan_por_dia.get(_iso_day(d), 0)
        x = cursor
        while x.timestamp() <= d.timestamp():
            acc_real += real_por_dia.get(_iso_day(x), 0)
            x = _add_days(x, 1)
        cursor = _add_days(d, 1)
        k = _iso_day(d)
        pontos.append(
            {
                "data": k,
                "planejado": round(acc_plan * 10) / 10,
                "realizado": acc_real if k <= hoje_key else None,
            }
        )
    return pontos


def status_execucoes(totais: Mapping[str, float]) -> list[GraficoFatia]:
    return [
        {"key": "passeds", "label": "CTS Passeds", "value": totais.get("passeds", 0)},
        {"key": "na", "label": "CTS N/A", "value": totais.get("na", 0)},
        {"key": "cancelados", "label": "CTS Cancelados", "value": totais.get("cancelados", 0)},
        {"key": "falhados", "label": "CTS Falhados", "value": totais.get("falhados", 0)},
        {"key": "bloqueados", "label": "CTS Bloqueados", "value": totais.get("bloqueados", 0)},
        {"key": "liberados", "label": "CTS Liberados", "value": totais.get("liberados", 0)},
        {"key": "design", "label": "CTS Design", "value": totais.get("design", 0)},
        {"key": "naoLiberados", "label": "CTS Não Liberados", "value": totais.get("naoLiberados", 0)},
    ]
