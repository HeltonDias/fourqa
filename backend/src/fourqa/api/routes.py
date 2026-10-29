"""API router (mirrors backend/src/routes/api.ts)."""

from __future__ import annotations

import os
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from fastapi.responses import JSONResponse

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
from fourqa.http.write_auth import decide_read_auth, decide_write_auth, open_writes_allowed
from fourqa.persistence.plan_key import explicit_plan_key_from_query, plan_key_from_raw, plan_key_write_error
from fourqa.persistence.planning_conflict import PlanningConflictError
from fourqa.persistence.provider import get_stores, persistence_ready

router = APIRouter()


def _reads_are_protected() -> bool:
    return os.environ.get("VERCEL") == "1" and env_value("FOURQA_PROTECT_READS") != "0"


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
    fallback = DEFAULT_PLAN_KEY
    try:
        stores = await get_stores()
        fallback = (await stores["meta"].get("kpi_plan_key")) or DEFAULT_PLAN_KEY
    except Exception:
        fallback = DEFAULT_PLAN_KEY
    return plan_key_from_raw(plan_key, fallback)


def require_write_auth(authorization: Annotated[str | None, Header()] = None) -> None:
    decision = _write_decision(authorization)
    if decision == "allow":
        return
    if decision == "unconfigured":
        raise HTTPException(
            status_code=503,
            detail="Escrita desabilitada. Configure FOURQA_API_TOKEN ou FOURQA_ALLOW_OPEN_WRITES=1 neste ambiente.",
        )
    raise HTTPException(status_code=401, detail="Não autorizado.")


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
    except PlanningConflictError as err:
        raise HTTPException(status_code=409, detail=str(err)) from err
    except Exception as err:
        raise HTTPException(status_code=400, detail=str(err) if str(err) else "Não foi possível gravar o cabeçalho.") from err


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
    except PlanningConflictError as err:
        raise HTTPException(status_code=409, detail=str(err)) from err
    except Exception as err:
        raise HTTPException(status_code=400, detail=str(err) if str(err) else "Não foi possível gravar o período.") from err


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
    except PlanningConflictError as err:
        raise HTTPException(status_code=409, detail=str(err)) from err
    except Exception as err:
        raise HTTPException(status_code=400, detail=str(err) if str(err) else "Não foi possível gravar a revisão.") from err


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
                "expectedText": cell_base.get("expectedText"),
                "expectedQuantity": cell_base.get("expectedQuantity"),
            },
        )
    except PlanningConflictError as err:
        raise HTTPException(status_code=409, detail=str(err)) from err
    except Exception as err:
        raise HTTPException(status_code=400, detail=str(err) if str(err) else "Não foi possível gravar a célula.") from err


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
                "expectedText": cell_base.get("expectedText"),
                "expectedQuantity": cell_base.get("expectedQuantity"),
            }
        )
    try:
        return await save_planning_batch(pk, changes)
    except PlanningConflictError as err:
        raise HTTPException(status_code=409, detail=str(err)) from err
    except Exception as err:
        raise HTTPException(status_code=400, detail=str(err) if str(err) else "Não foi possível gravar as alterações.") from err


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
    except PlanningConflictError as err:
        raise HTTPException(status_code=409, detail=str(err)) from err
    except Exception as err:
        raise HTTPException(status_code=400, detail=str(err) if str(err) else "Não foi possível distribuir.") from err


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
    except PlanningConflictError as err:
        raise HTTPException(status_code=409, detail=str(err)) from err
    except Exception as err:
        raise HTTPException(status_code=400, detail=str(err) if str(err) else "Não foi possível limpar o planejamento.") from err


@router.get("/status-frente")
async def status_frente(planKey: str | None = None):
    await _ready()
    from fourqa.services.report_service import get_status_por_frente

    return await get_status_por_frente(await _plan_key_from_query(planKey))


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
    return present_parameters(read_sync_settings(), decoded.get("draft"), decoded.get("warning"))


@router.put("/sync/config")
async def sync_config_put(body: dict[str, Any], _: None = Depends(require_write_auth)):
    await _ready()
    stores = await get_stores()
    if body.get("reset") is True:
        await stores["meta"].set(SYNC_PARAMETERS_KEY, "")
        env_plan = read_sync_settings().get("kpiPlanKey")
        if env_plan:
            await stores["meta"].set("kpi_plan_key", str(env_plan))
        decoded = decode_stored_parameters("")
        return present_parameters(read_sync_settings(), decoded.get("draft"), decoded.get("warning"))
    try:
        draft = parse_sync_parameters(body)
        import json

        await stores["meta"].set(SYNC_PARAMETERS_KEY, json.dumps(draft))
        await stores["meta"].set("kpi_plan_key", draft["kpiPlanKey"])
        return present_parameters(read_sync_settings(), draft, None)
    except Exception as err:
        raise HTTPException(status_code=400, detail=str(err) if str(err) else "Não foi possível gravar os parâmetros.") from err


@router.get("/execucoes")
async def execucoes(request: Request, planKey: str | None = None):
    await _ready()
    stores = await get_stores()
    page = parse_page_query(dict(request.query_params))
    page["plan_key"] = await _plan_key_from_query(planKey)
    return await stores["azure_snapshot"].query_execucoes(page)


@router.get("/falhas")
async def falhas(request: Request, planKey: str | None = None):
    await _ready()
    stores = await get_stores()
    page = parse_page_query(dict(request.query_params))
    page["plan_key"] = await _plan_key_from_query(planKey)
    return await stores["azure_snapshot"].query_falhas(page)
