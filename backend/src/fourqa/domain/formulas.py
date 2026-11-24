"""Formula layer."""

from __future__ import annotations

import re
from typing import Any, Mapping, Required, TypedDict

from fourqa.types import ExecucaoRow, FalhaRow, StatusCenario

DEFAULT_PLAN_KEY = "EndToEnd"

STATUS_COLUNA: dict[StatusCenario, str] = {
    "passed": "cts_passeds",
    "na": "cts_na",
    "falhado": "cts_falhados",
    "bloqueado": "cts_bloqueados",
    "design": "cts_design",
    "naoLiberado": "cts_nao_liberados",
    "liberado": "cts_liberados",
}


def _norm(v: str | None) -> str:
    return (v or "").strip()


def estado_ponto(r: Mapping[str, Any]) -> str:
    outcome = _norm(r.get("outcome"))
    switch = outcome.lower()
    if switch == "passed":
        return "Passed"
    if switch == "failed":
        return "Failed"
    if switch == "blocked":
        return "Blocked"
    if switch == "notapplicable":
        return "Closed"
    state = _norm(r.get("test_point_state"))
    if state.lower() == "ready":
        return "Ready"
    return "Unspecified" if state else ""


def _match_contains(haystack: str, needle: str) -> bool:
    return needle.upper() in haystack.upper()


class ExecFilter(TypedDict, total=False):
    planKey: str
    suiteName: str
    suiteId: str | int
    testPointState: str
    testCaseState: str
    outcome: str
    responsabilidade: str


def count_execucoes(rows: list[ExecucaoRow], f: ExecFilter) -> int:
    n = 0
    for r in rows:
        if (plan_key := f.get("planKey")) and _norm(r.get("plan_key")) != plan_key:
            continue
        if (suite_name := f.get("suiteName")) is not None and _norm(r.get("suite_name")) != _norm(str(suite_name)):
            continue
        if (suite_id := f.get("suiteId")) is not None and str(r.get("suite_id") or "") != str(suite_id):
            continue
        if (point_state := f.get("testPointState")) is not None and estado_ponto(r) != point_state:
            continue
        if (case_state := f.get("testCaseState")) is not None and _norm(r.get("test_case_state")) != case_state:
            continue
        if (outcome := f.get("outcome")) is not None and _norm(r.get("outcome")) != outcome:
            continue
        if (resp := f.get("responsabilidade")) is not None and _norm(r.get("responsabilidade")) != resp:
            continue
        n += 1
    return n


def classify_execution(r: Mapping[str, Any]) -> StatusCenario:
    ponto = estado_ponto(r)
    if ponto == "Passed":
        return "passed"
    if ponto == "Closed":
        return "na"
    if ponto == "Failed":
        return "falhado"
    if ponto == "Blocked":
        return "bloqueado"
    tc = _norm(r.get("test_case_state")).lower()
    if tc == "design":
        return "design"
    if tc in ("não atribuído", "nao atribuido"):
        return "naoLiberado"
    return "liberado" if ponto == "Ready" else "naoLiberado"


def status_cenario(r: ExecucaoRow) -> StatusCenario:
    return classify_execution(r)


def metricas_por_processo(exec_rows: list[ExecucaoRow], plan_key: str, processo: str) -> dict[str, int]:
    if not processo:
        return {
            "cts_passeds": 0,
            "cts_na": 0,
            "cts_falhados": 0,
            "cts_bloqueados": 0,
            "cts_liberados": 0,
            "cts_design": 0,
            "cts_nao_liberados": 0,
        }
    out = {v: 0 for v in STATUS_COLUNA.values()}
    for r in exec_rows:
        if _norm(r.get("plan_key")) != plan_key or _norm(r.get("suite_name")) != _norm(processo):
            continue
        col = STATUS_COLUNA[classify_execution(r)]
        out[col] += 1
    return out


def metricas_dos_pontos(rows: list[ExecucaoRow]) -> dict[str, int]:
    out = {v: 0 for v in STATUS_COLUNA.values()}
    for r in rows:
        out[STATUS_COLUNA[classify_execution(r)]] += 1
    return out


def total_realizado_linha(metrics: Mapping[str, int]) -> int:
    return int(metrics["cts_passeds"]) + int(metrics["cts_na"])


def finalizados_com_cancelados(metrics: Mapping[str, float], cts_cancelados: float) -> float:
    return int(metrics["cts_passeds"]) + int(metrics["cts_na"]) + (cts_cancelados or 0)


def impacto_total_test_point(exec_rows: list[ExecucaoRow], plan_key: str) -> int:
    return count_execucoes(exec_rows, {"planKey": plan_key, "testPointState": "Failed"}) + count_execucoes(
        exec_rows, {"planKey": plan_key, "testPointState": "Blocked"}
    )


def _is_open_bug_status(status: str) -> bool:
    s = status.lower()
    return s in ("new", "active")


def _bug_by_id(falhas: list[FalhaRow]) -> dict[int, FalhaRow]:
    m: dict[int, FalhaRow] = {}
    for f in falhas:
        bid = f.get("bug_id")
        if bid is not None:
            m[int(bid)] = f
    return m


def classificar_impactos_kpi(
    exec_rows: list[ExecucaoRow], falhas: list[FalhaRow], plan_key: str
) -> dict[str, int]:
    bugs = _bug_by_id([f for f in falhas if _norm(f.get("plan_key")) == plan_key])
    foursys = cliente = reteste = 0
    cenarios = [
        r
        for r in exec_rows
        if _norm(r.get("plan_key")) == plan_key
        and _norm(r.get("outcome")).lower() in ("failed", "blocked")
    ]
    for c in cenarios:
        tags = _norm(c.get("test_case_tags"))
        classified = False
        for f in falhas:
            if _norm(f.get("plan_key")) != plan_key or not f.get("bug_id"):
                continue
            if not _is_open_bug_status(_norm(f.get("status"))):
                continue
            frente_match = bool(tags and f.get("frente") and _match_contains(tags, _norm(f.get("frente"))))
            titulo = _norm(c.get("test_case_title"))
            titulo_match = bool(
                titulo
                and f.get("titulo")
                and _match_contains(_norm(f.get("titulo")), titulo[:20])
            )
            if not frente_match and not titulo_match:
                continue
            resp = _norm(f.get("responsavel"))
            if "Foursys" in resp:
                foursys += 1
                classified = True
                break
            if "Cliente" in resp or "CVP" in resp:
                cliente += 1
                classified = True
                break
        if not classified:
            reteste += 1
    return {"foursys": foursys, "cliente": cliente, "reteste": reteste}


class FalhaFilter(TypedDict, total=False):
    planKey: Required[str]
    frenteContains: str
    responsavel: str
    status: str
    statusNot: str
    fechamentoEmpty: bool
    fechamentoNotEmpty: bool
    criacaoEmpty: bool
    idNotEmpty: bool


def count_falhas(rows: list[FalhaRow], f: FalhaFilter) -> int:
    n = 0
    for r in rows:
        if _norm(r.get("plan_key")) != f["planKey"]:
            continue
        if (frente := f.get("frenteContains")) and not _match_contains(_norm(r.get("frente")), frente):
            continue
        if (responsavel := f.get("responsavel")) is not None and _norm(r.get("responsavel")) != responsavel:
            continue
        if (status := f.get("status")) is not None and _norm(r.get("status")) != status:
            continue
        if (status_not := f.get("statusNot")) is not None and _norm(r.get("status")) == status_not:
            continue
        if f.get("fechamentoEmpty") and _norm(r.get("fechamento")) != "":
            continue
        if f.get("fechamentoNotEmpty") and _norm(r.get("fechamento")) == "":
            continue
        if f.get("criacaoEmpty") and _norm(r.get("criacao")) != "":
            continue
        if f.get("idNotEmpty") and (r.get("bug_id") is None or r.get("bug_id") == 0):
            continue
        n += 1
    return n


def sumif_frente(rows: list[Any], frente_needle: str, field: str) -> float:
    total = 0.0
    for row in rows:
        frente = row.get("frente") if isinstance(row, Mapping) else getattr(row, "frente", None)
        if not _match_contains(_norm(frente), frente_needle):
            continue
        v = row.get(field) if isinstance(row, Mapping) else getattr(row, field, 0)
        total += float(v) if isinstance(v, (int, float)) else float(v or 0)
    return int(total) if total == int(total) else total
