"""API router."""

from __future__ import annotations

import os
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import JSONResponse

from fourqa.auth.access import guard_plan_key, require_write_access
from fourqa.auth.context import current_connection
from fourqa.azure.azure_cache_read_source import AzureCacheUnavailableError
from fourqa.azure.config import SyncConfigError, env_value, read_sync_settings
from fourqa.azure.sync_parameters import (
    SYNC_PARAMETERS_KEY,
    decode_stored_parameters,
    parse_sync_parameters,
    present_parameters,
)
from fourqa.domain.formulas import DEFAULT_PLAN_KEY
from fourqa.domain.plan_period import PlanningPeriodError
from fourqa.http.meta_base import parse_meta_pair
from fourqa.http.page_query import parse_page_query
from fourqa.http.planning_cell_base import parse_planning_cell_base
from fourqa.http.write_auth import (
    SESSION_COOKIE,
    cookie_is_secure,
    decide_write_auth,
    open_writes_allowed,
    presented_authorization,
    token_matches,
)
from fourqa.persistence.plan_key import explicit_plan_key_from_query, plan_key_from_raw, plan_key_write_error
from fourqa.persistence.planning_conflict import PlanningConflictError
from fourqa.persistence.provider import get_stores, persistence_ready

router = APIRouter()


def _write_decision(authorization: str | None) -> str:
    return decide_write_auth(
        configured_token=env_value("FOURQA_API_TOKEN"),
        allow_open_writes=open_writes_allowed(
            vercel=os.environ.get("VERCEL") == "1",
            allow_open_writes_flag=env_value("FOURQA_ALLOW_OPEN_WRITES"),
        ),
        authorization_header=authorization,
    )


async def _ready() -> None:
    if not await persistence_ready():
        raise HTTPException(status_code=503, detail="Banco indisponível.")


async def _plan_key_from_query(plan_key: str | None) -> str:
    connection = current_connection.get()
    if connection is not None:
        return plan_key.strip() if isinstance(plan_key, str) and plan_key.strip() else str(connection["plan_key"])
    fallback = DEFAULT_PLAN_KEY
    try:
        stores = await get_stores()
        fallback = (await stores["meta"].get("kpi_plan_key")) or DEFAULT_PLAN_KEY
    except Exception:
        fallback = DEFAULT_PLAN_KEY
    resolved = plan_key_from_raw(plan_key, fallback)
    await guard_plan_key(resolved)
    return resolved


def _request_authorization(request: Request) -> str | None:
    return presented_authorization(request.headers.get("authorization"), request.cookies.get(SESSION_COOKIE))


def _raise_client_or_hide(err: Exception, fallback: str) -> None:
    if isinstance(err, (HTTPException, PlanningPeriodError, AzureCacheUnavailableError)):
        raise err
    if isinstance(err, PlanningConflictError):
        raise HTTPException(status_code=409, detail=str(err)) from err
    if isinstance(err, ValueError):
        raise HTTPException(status_code=400, detail=str(err)) from err
    raise HTTPException(status_code=500, detail=fallback) from err


async def require_write_auth(request: Request) -> None:
    await require_write_access(request)


def _session_secure(request: Request) -> bool:
    scheme = request.headers.get("x-forwarded-proto", request.url.scheme)
    return cookie_is_secure(vercel=os.environ.get("VERCEL") == "1", scheme=scheme)


@router.post("/session")
async def open_session(body: dict[str, Any], request: Request):
    presented = body.get("token")
    if not isinstance(presented, str):
        raise HTTPException(status_code=400, detail="Informe o token.")
    configured = env_value("FOURQA_API_TOKEN").strip()
    if not configured:
        raise HTTPException(
            status_code=503,
            detail="Escrita desabilitada. Configure FOURQA_API_TOKEN neste ambiente.",
        )
    if not token_matches(configured, presented.strip()):
        raise HTTPException(status_code=401, detail="Não autorizado.")
    response = JSONResponse({"ok": True})
    response.set_cookie(
        key=SESSION_COOKIE,
        value=configured,
        httponly=True,
        secure=_session_secure(request),
        samesite="lax",
        path="/",
        max_age=12 * 60 * 60,
    )
    return response


@router.delete("/session")
async def close_session(request: Request):
    response = JSONResponse({"ok": True})
    response.delete_cookie(key=SESSION_COOKIE, path="/", httponly=True, secure=_session_secure(request), samesite="lax")
    return response


@router.get("/session")
async def session_state(request: Request):
    configured = env_value("FOURQA_API_TOKEN").strip()
    decision = _write_decision(_request_authorization(request))
    return {"active": bool(configured) and decision == "allow"}


@router.get("/health")
async def health():
    ok = await persistence_ready()
    return {"ok": ok, "database": "ready" if ok else "unavailable"}


@router.get("/meta")
async def meta():
    await _ready()
    from fourqa.services.report_service import get_home

    try:
        home = await get_home()
        return home["periodo"]
    except PlanningPeriodError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err


@router.get("/home")
async def home(planKey: str | None = None):
    await _ready()
    from fourqa.services.report_service import get_home

    try:
        return await get_home(await _plan_key_from_query(planKey))
    except PlanningPeriodError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err


@router.put("/cabecalho")
async def cabecalho(body: dict[str, Any], _: None = Depends(require_write_auth)):
    await _ready()
    from fourqa.services.report_service import set_cabecalho

    title, subtitle = body.get("title"), body.get("subtitle")
    if not isinstance(title, str) or not title.strip() or not isinstance(subtitle, str):
        raise HTTPException(status_code=400, detail="Informe o título (obrigatório) e o subtítulo.")
    if len(title) > 200 or len(subtitle) > 300:
        raise HTTPException(status_code=400, detail="Título até 200 e subtítulo até 300 caracteres.")
    header_base = parse_meta_pair(body, "baseTitle", "baseSubtitle")
    if header_base["present"] and not header_base["valid"]:
        raise HTTPException(status_code=400, detail="Informe a base do cabeçalho.")
    try:
        return await set_cabecalho(
            title,
            subtitle,
            {
                "guard": header_base["present"],
                "baseTitle": header_base["a"],
                "baseSubtitle": header_base["b"],
            },
        )
    except Exception as err:
        _raise_client_or_hide(err, "Não foi possível gravar o cabeçalho.")


@router.put("/periodo")
async def periodo(body: dict[str, Any], _: None = Depends(require_write_auth)):
    await _ready()
    from fourqa.services.report_service import set_periodo_plano

    inicio, fim = body.get("inicio"), body.get("fim")
    if not isinstance(inicio, str) or not isinstance(fim, str):
        raise HTTPException(status_code=400, detail="Informe início e fim.")
    period_base = parse_meta_pair(body, "baseInicio", "baseFim")
    if period_base["present"] and not period_base["valid"]:
        raise HTTPException(status_code=400, detail="Informe a base do período.")
    try:
        return await set_periodo_plano(
            inicio,
            fim,
            {"guard": period_base["present"], "baseInicio": period_base["a"], "baseFim": period_base["b"]},
        )
    except Exception as err:
        _raise_client_or_hide(err, "Não foi possível gravar o período.")


@router.get("/planejamento")
async def planejamento(planKey: str | None = None, version: int | None = None):
    await _ready()
    from fourqa.services.planning_service import get_planning_view

    try:
        return await get_planning_view(await _plan_key_from_query(planKey), version if version and version > 0 else None)
    except PlanningPeriodError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err


@router.get("/planejamento/alteracoes")
async def planejamento_alteracoes(planKey: str | None = None):
    await _ready()
    from fourqa.services.planning_service import get_planning_history

    try:
        return await get_planning_history(await _plan_key_from_query(planKey))
    except PlanningPeriodError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err


@router.post("/planejamento/revisao")
async def planejamento_revisao(body: dict[str, Any], planKey: str | None = None, _: None = Depends(require_write_auth)):
    await _ready()
    from fourqa.services.planning_service import confirm_or_revise

    pk = explicit_plan_key_from_query(planKey)
    if not pk:
        raise HTTPException(status_code=400, detail=plan_key_write_error(planKey))
    try:
        return await confirm_or_revise(pk, {"reason": body.get("reason") if isinstance(body.get("reason"), str) else "", "adoptSource": body.get("adoptSource") is not False})
    except Exception as err:
        _raise_client_or_hide(err, "Não foi possível gravar a revisão.")


@router.put("/planejamento/celula")
async def planejamento_celula(body: dict[str, Any], planKey: str | None = None, _: None = Depends(require_write_auth)):
    await _ready()
    from fourqa.services.planning_service import save_planning_cell

    field = body.get("field")
    if field not in ("start", "end", "day", "responsavel", "prioridade"):
        raise HTTPException(status_code=400, detail="Campo inválido.")
    pk = explicit_plan_key_from_query(planKey)
    if not pk:
        raise HTTPException(status_code=400, detail=plan_key_write_error(planKey))
    cell_base = parse_planning_cell_base(body, field)
    if cell_base is None:
        raise HTTPException(status_code=400, detail="Base da célula inválida.")
    try:
        return await save_planning_cell(
            pk,
            {
                "suiteId": body.get("suiteId") if isinstance(body.get("suiteId"), int) else None,
                "testPointId": body.get("testPointId") if isinstance(body.get("testPointId"), int) else None,
                "field": field,
                "date": body.get("date") if isinstance(body.get("date"), str) else None,
                "quantity": body.get("quantity") if isinstance(body.get("quantity"), (int, float)) else None,
                "value": body.get("value") if isinstance(body.get("value"), str) else None,
                "guard": cell_base.get("guard"),
                "expectedText": cell_base.get("expected_text"),
                "expectedQuantity": cell_base.get("expected_quantity"),
            },
        )
    except Exception as err:
        _raise_client_or_hide(err, "Não foi possível gravar a célula.")


@router.put("/planejamento/lote")
async def planejamento_lote(body: dict[str, Any], planKey: str | None = None, _: None = Depends(require_write_auth)):
    await _ready()
    from fourqa.services.planning_service import save_planning_batch

    pk = explicit_plan_key_from_query(planKey)
    if not pk:
        raise HTTPException(status_code=400, detail=plan_key_write_error(planKey))
    raw = body.get("changes")
    if not isinstance(raw, list) or not raw:
        raise HTTPException(status_code=400, detail="Nenhuma alteração.")
    changes = []
    for row in raw:
        if not isinstance(row, dict):
            raise HTTPException(status_code=400, detail="Alteração inválida.")
        field = row.get("field")
        if field not in ("start", "end", "day"):
            raise HTTPException(status_code=400, detail="Campo inválido.")
        cell_base = parse_planning_cell_base(row, field)
        if cell_base is None:
            raise HTTPException(status_code=400, detail="Base da célula inválida.")
        changes.append(
            {
                "suiteId": row.get("suiteId") if isinstance(row.get("suiteId"), int) else None,
                "testPointId": row.get("testPointId") if isinstance(row.get("testPointId"), int) else None,
                "field": field,
                "date": row.get("date") if isinstance(row.get("date"), str) else None,
                "quantity": row.get("quantity") if isinstance(row.get("quantity"), (int, float)) else None,
                "guard": cell_base.get("guard"),
                "expectedText": cell_base.get("expected_text"),
                "expectedQuantity": cell_base.get("expected_quantity"),
            }
        )
    try:
        return await save_planning_batch(pk, changes)
    except Exception as err:
        _raise_client_or_hide(err, "Não foi possível gravar as alterações.")


@router.put("/planejamento/distribuir")
async def planejamento_distribuir(body: dict[str, Any], planKey: str | None = None, _: None = Depends(require_write_auth)):
    await _ready()
    from fourqa.services.planning_service import distribute_planning

    pk = explicit_plan_key_from_query(planKey)
    if not pk:
        raise HTTPException(status_code=400, detail=plan_key_write_error(planKey))
    weekends = body.get("enabledWeekendDays")
    if not isinstance(weekends, list) or any(not isinstance(d, str) for d in weekends):
        raise HTTPException(status_code=400, detail="Dias de feriado/fim de semana inválidos.")
    resguardo = body.get("resguardo")
    if not isinstance(resguardo, int):
        raise HTTPException(status_code=400, detail="Resguardo inválido.")
    try:
        return await distribute_planning(
            pk,
            {
                "strategy": body.get("strategy") if isinstance(body.get("strategy"), str) else "",
                "start": body.get("start") if isinstance(body.get("start"), str) else "",
                "end": body.get("end") if isinstance(body.get("end"), str) else "",
                "resguardo": resguardo,
                "enabledWeekendDays": weekends,
                "replace": body.get("replace") is True,
                "assignment": body.get("assignment") if isinstance(body.get("assignment"), str) else None,
                "mode": body.get("mode") if isinstance(body.get("mode"), str) else None,
                "cut": body.get("cut") if isinstance(body.get("cut"), str) else None,
                "preview": body.get("preview") is True,
            },
        )
    except Exception as err:
        _raise_client_or_hide(err, "Não foi possível distribuir.")


@router.put("/planejamento/limpar")
async def planejamento_limpar(body: dict[str, Any] | None = None, planKey: str | None = None, _: None = Depends(require_write_auth)):
    await _ready()
    from fourqa.services.planning_service import clear_planning_to_finalized

    pk = explicit_plan_key_from_query(planKey)
    if not pk:
        raise HTTPException(status_code=400, detail=plan_key_write_error(planKey))
    body = body or {}
    try:
        return await clear_planning_to_finalized(pk, {"preview": body.get("preview") is True})
    except Exception as err:
        _raise_client_or_hide(err, "Não foi possível limpar o planejamento.")


@router.get("/status-frente")
async def status_frente(planKey: str | None = None):
    await _ready()
    from fourqa.services.report_service import get_status_por_frente

    return await get_status_por_frente(await _plan_key_from_query(planKey))


@router.get("/evolucao-qa")
async def evolucao_qa(planKey: str | None = None, start: str | None = Query(None, alias="from"), to: str | None = None):
    await _ready()
    from fourqa.services.evolucao_service import get_evolucao_qa

    try:
        return await get_evolucao_qa(await _plan_key_from_query(planKey), start, to)
    except (ValueError, PlanningPeriodError) as err:
        raise HTTPException(status_code=400, detail=str(err)) from err


@router.post("/sync")
async def sync_start(_: None = Depends(require_write_auth)):
    await _ready()
    from fourqa.services.sync_service import start_sync

    try:
        result = await start_sync()
        code = 202 if result.get("started") else 200
        return JSONResponse(status_code=code, content=result)
    except SyncConfigError as err:
        raise HTTPException(status_code=400, detail={"error": str(err), "missing": err.missing}) from err
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail={"error": "Falha ao iniciar a sincronização."})


@router.get("/sync/status")
async def sync_status():
    from fourqa.services.sync_service import get_sync_state

    return await get_sync_state()


@router.get("/sync/config")
async def sync_config():
    await _ready()
    stores = await get_stores()
    raw = await stores["meta"].get(SYNC_PARAMETERS_KEY)
    decoded = decode_stored_parameters(raw if isinstance(raw, str) else None)
    return present_parameters(await _sync_settings_view(), decoded.get("draft"), decoded.get("warning"))


async def _sync_settings_view() -> dict[str, object]:
    from fourqa.services.sync_service import connection_sync_settings

    connection = current_connection.get()
    if connection is None:
        return read_sync_settings()
    return await connection_sync_settings(connection)


@router.put("/sync/config")
async def sync_config_put(body: dict[str, Any], _: None = Depends(require_write_auth)):
    await _ready()
    stores = await get_stores()
    connection = current_connection.get()
    if body.get("reset") is True:
        await stores["meta"].set(SYNC_PARAMETERS_KEY, "")
        settings = await _sync_settings_view()
        if settings.get("kpiPlanKey"):
            await stores["meta"].set("kpi_plan_key", str(settings["kpiPlanKey"]))
        decoded = decode_stored_parameters("")
        return present_parameters(settings, decoded.get("draft"), decoded.get("warning"))
    try:
        if connection is not None:
            body = {**body, "kpiPlanKey": connection["plan_key"]}
        draft = parse_sync_parameters(body)
        import json

        await stores["meta"].set(SYNC_PARAMETERS_KEY, json.dumps(draft))
        await stores["meta"].set("kpi_plan_key", draft["kpiPlanKey"])
        return present_parameters(await _sync_settings_view(), draft, None)
    except Exception as err:
        _raise_client_or_hide(err, "Não foi possível gravar os parâmetros.")


@router.get("/execucoes")
async def execucoes(request: Request, planKey: str | None = None):
    await _ready()
    stores = await get_stores()
    page = parse_page_query(dict(request.query_params), await _plan_key_from_query(planKey))
    return await stores["azure_snapshot"].query_execucoes(page)


@router.get("/falhas")
async def falhas(request: Request, planKey: str | None = None):
    await _ready()
    stores = await get_stores()
    page = parse_page_query(dict(request.query_params), await _plan_key_from_query(planKey))
    return await stores["azure_snapshot"].query_falhas(page)
