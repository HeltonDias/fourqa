"""Report service."""

from __future__ import annotations

import json
from collections.abc import Mapping
from datetime import datetime, timezone
from typing import Any

from fourqa.domain.dimensions import DetectedDimension, infer_dimensions
from fourqa.domain.evolucao_status import status_evolucao, status_geral_de
from fourqa.domain.formulas import (
    DEFAULT_PLAN_KEY,
    FalhaFilter,
    classificar_impactos_kpi,
    count_falhas,
    finalizados_com_cancelados,
    impacto_total_test_point,
    metricas_dos_pontos,
    sumif_frente,
    total_realizado_linha,
)
from fourqa.domain.graficos import planejado_ate_hoje, planejado_vs_realizado, status_execucoes
from fourqa.domain.legacy_plan_owner import is_legacy_plan_owner
from fourqa.domain.plan_period import assert_planning_period, assert_stored_planning_period
from fourqa.domain.report_groups import group_execucoes_for_report
from fourqa.domain.status_frente import ha_sobreposicao_frentes, indicadores_frente
from fourqa.persistence.contracts import LegacyPlanRow
from fourqa.persistence.provider import get_stores
from fourqa.types import ExecucaoRow, FalhaRow

PERIOD_KEYS = ("data_inicio", "data_fim", "data_fim_linha")
HEADER_KEYS = ("cabecalho_titulo", "title", "cabecalho_subtitulo")
DEFAULT_REPORT_TITLE = "STATUS REPORT QA"
DEFAULT_REPORT_SUBTITLE = "FASE - Execução QA - Testes EndToEnd - Validacão da V1 para V3"


async def _stores():
    return await get_stores()


async def _load_meta(keys: tuple[str, ...]) -> dict[str, str | None]:
    stores = await _stores()
    return await stores["meta"].get_many(list(keys))


def _meta(bag: dict[str, str | None], key: str) -> str | None:
    return bag.get(key)


def _home_meta_keys(plan_key: str) -> list[str]:
    return [
        *PERIOD_KEYS,
        "planejamento_legado_plan_key",
        f"dimensoes_catalog:{plan_key}",
        f"kpi_impactos:{plan_key}",
        *HEADER_KEYS,
        "ultima_sincronizacao_azure",
        "imported_at",
    ]


def _suite_label(processo: str) -> str:
    p = processo.strip()
    return p if len(p) <= 36 else f"{p[:33]}…"


def _is_linha_totais(row: Mapping[str, Any]) -> bool:
    import re

    return bool(re.search(r"valores\s+totais", str(row.get("processo") or ""), re.I))


def _periodo_from(bag: dict[str, str | None]) -> dict[str, str]:
    return {
        "inicio": _meta(bag, "data_inicio") or "",
        "fim": _meta(bag, "data_fim") or "",
        "referencia": _meta(bag, "data_fim_linha") or "",
    }


async def _periodo_geral() -> dict[str, str]:
    return _periodo_from(await _load_meta(PERIOD_KEYS))


async def _legacy_base(plan_key: str, bag: dict[str, str | None] | None = None) -> list[LegacyPlanRow]:
    stores = await _stores()
    owner = _meta(bag, "planejamento_legado_plan_key") if bag else await stores["meta"].get("planejamento_legado_plan_key")
    if not is_legacy_plan_owner(plan_key, owner):
        return []
    rows = await stores["legacy_plan"].list_base()
    return [r for r in rows if not _is_linha_totais(r)]


async def _build_planejamento(plan_key: str, exec_rows: list[ExecucaoRow], dimensoes: list[DetectedDimension], bag: dict[str, str | None] | None = None):
    periodo = _periodo_from(bag) if bag else await _periodo_geral()
    key = lambda s: (s or "").strip().lower()
    planejamento = {key(r.get("processo")): r for r in await _legacy_base(plan_key, bag)}
    legacy_qty_applied: set[str] = set()
    out = []
    for i, s in enumerate(group_execucoes_for_report(exec_rows, dimensoes)):
        legacy_key = key(s.get("processo"))
        p = planejamento.get(legacy_key)
        apply_legacy = bool(p) and legacy_key not in legacy_qty_applied
        if apply_legacy:
            legacy_qty_applied.add(legacy_key)
        pontos = s["rows"]
        m = metricas_dos_pontos(pontos)
        cts_cancelados = float(p.get("cts_cancelados") or 0) if apply_legacy and p else 0
        qtd = len(pontos)
        datas_confirmadas = bool(p and (p.get("data_inicio") or p.get("data_fim")))
        data_inicio = (p.get("data_inicio") if p else None) or periodo["inicio"] or None
        data_fim = (p.get("data_fim") if p else None) or periodo["fim"] or None
        out.append(
            {
                **s,
                "row_num": i + 1,
                "qa": p.get("qa") if p else None,
                "prioridades": p.get("prioridades") if p else None,
                "data_inicio": data_inicio,
                "data_fim": data_fim,
                "replanejamento": float(p.get("replanejamento") or 0) if apply_legacy and p else 0,
                "qtd_cts_plan": qtd,
                "cts_plan_dia": planejado_ate_hoje(qtd, data_inicio, data_fim),
                "cts_cancelados": cts_cancelados,
                **m,
                "total_realizado": total_realizado_linha(m),
                "planejamentoOrigem": "confirmado"
                if datas_confirmadas
                else ("periodo_plano" if (data_inicio or data_fim) else "ausente"),
            }
        )
    return out


def _sum_totals(linhas: list[dict[str, Any]]) -> dict[str, float]:
    def s(k: str) -> float:
        return sum(float(r.get(k) or 0) for r in linhas)

    return {
        "ctsPlan": s("qtd_cts_plan"),
        "ctsPlanAteHoje": s("cts_plan_dia"),
        "totalRealizado": s("total_realizado"),
        "passeds": s("cts_passeds"),
        "na": s("cts_na"),
        "cancelados": s("cts_cancelados"),
        "falhados": s("cts_falhados"),
        "bloqueados": s("cts_bloqueados"),
        "liberados": s("cts_liberados"),
        "design": s("cts_design"),
        "naoLiberados": s("cts_nao_liberados"),
    }


def _contar_por(rows: list[dict[str, str]]) -> list[dict[str, Any]]:
    counts: dict[str, int] = {}
    for r in rows:
        counts[r["value"]] = counts.get(r["value"], 0) + 1
    return [{"key": k, "label": k, "value": v} for k, v in sorted(counts.items())]


def _catalog(plan_key: str, exec_rows: list[ExecucaoRow], bag: dict[str, str | None]) -> list[DetectedDimension]:
    raw = _meta(bag, f"dimensoes_catalog:{plan_key}")
    if raw:
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, list) and parsed:
                return [d for d in parsed if d.get("visible") is not False]
        except json.JSONDecodeError:
            pass
    return infer_dimensions(exec_rows)


def _kpi_from(plan_key: str, bag: dict[str, str | None]) -> dict[str, float] | None:
    raw = _meta(bag, f"kpi_impactos:{plan_key}")
    if not raw:
        return None
    try:
        k = json.loads(raw)
        nums = [k.get("foursys"), k.get("cliente"), k.get("reteste")]
        if all(isinstance(n, (int, float)) for n in nums):
            return {"foursys": float(k["foursys"]), "cliente": float(k["cliente"]), "reteste": float(k["reteste"])}
    except json.JSONDecodeError:
        pass
    return None


def _cabecalho_from(bag: dict[str, str | None]) -> dict[str, str]:
    return {
        "title": (_meta(bag, "cabecalho_titulo") or _meta(bag, "title") or DEFAULT_REPORT_TITLE).strip(),
        "subtitle": (_meta(bag, "cabecalho_subtitulo") or DEFAULT_REPORT_SUBTITLE).strip(),
    }


async def get_cabecalho() -> dict[str, str]:
    return _cabecalho_from(await _load_meta(HEADER_KEYS))


async def set_cabecalho(title: str, subtitle: str, opts: dict[str, Any] | None = None) -> dict[str, str]:
    stores = await _stores()
    opts = opts or {}
    if opts.get("guard") and hasattr(stores["meta"], "replace_header_if"):
        await stores["meta"].replace_header_if(
            opts.get("baseTitle") or "",
            opts.get("baseSubtitle") or "",
            title,
            subtitle,
            DEFAULT_REPORT_TITLE,
            DEFAULT_REPORT_SUBTITLE,
        )
    else:
        await stores["meta"].set_many({"cabecalho_titulo": title.strip(), "cabecalho_subtitulo": subtitle.strip()})
    return await get_cabecalho()


async def set_periodo_plano(inicio: str, fim: str, opts: dict[str, Any] | None = None) -> dict[str, str]:
    stores = await _stores()
    opts = opts or {}
    period = assert_planning_period(inicio, fim)
    start, end = period["inicio"], period["fim"]
    if opts.get("guard") and hasattr(stores["meta"], "replace_period_if"):
        await stores["meta"].replace_period_if(opts.get("baseInicio") or "", opts.get("baseFim") or "", start, end)
    else:
        await stores["meta"].set_many({"data_inicio": start, "data_fim": end})
    return await _periodo_geral()


def _build_report_suites(linhas: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out = []
    for row in linhas:
        processo = str(row.get("processo") or "")
        ttl_cts = float(row.get("qtd_cts_plan") or 0)
        fin = float(row.get("total_realizado") or 0)
        gap = float(row.get("cts_plan_dia") or 0) - fin
        denom = ttl_cts or 1
        st = status_evolucao(
            gap=gap,
            ttl_cts=ttl_cts,
            finalizados=fin,
            na=float(row.get("cts_na") or 0),
        )
        out.append(
            {
                **row,
                "suiteLabel": _suite_label(processo),
                "ttlCts": ttl_cts,
                "gap": gap,
                "aprovUatPct": fin / denom,
                "conclusaoE2ePct": float(row.get("cts_passeds") or 0) / denom,
                "status": st,
            }
        )
    return out


async def get_home(plan_key: str = DEFAULT_PLAN_KEY) -> dict[str, Any]:
    bag = await _load_meta(tuple(_home_meta_keys(plan_key)))
    periodo = _periodo_from(bag)
    assert_stored_planning_period(periodo["inicio"], periodo["fim"])
    stores = await _stores()
    exec_rows = await stores["azure_snapshot"].list_execucoes(plan_key)
    falhas = await stores["azure_snapshot"].list_falhas(plan_key)
    dimensoes = _catalog(plan_key, exec_rows, bag)
    linhas = await _build_planejamento(plan_key, exec_rows, dimensoes, bag)
    totais = _sum_totals(linhas)
    kpi = _kpi_from(plan_key, bag) or classificar_impactos_kpi(exec_rows, falhas, plan_key)
    suites = _build_report_suites(linhas)
    status_geral = status_geral_de([s["status"] for s in suites])
    gap_total = sum(float(s["gap"]) for s in suites)
    ttl_cts = totais["ctsPlan"]
    executados = totais["passeds"] + totais["falhados"] + totais["bloqueados"]
    sobre_ttl = lambda x: x / ttl_cts if ttl_cts > 0 else 0
    sobre_exec = lambda x: x / executados if executados > 0 else 0
    falhas_por = lambda resp: sum(1 for f in falhas if (f.get("responsavel") or "").strip() == resp)
    cab = _cabecalho_from(bag)
    return {
        **cab,
        "planKey": plan_key,
        "periodo": periodo,
        "atualizadoEm": datetime.now(timezone.utc).isoformat(),
        "ultimaImportacao": _meta(bag, "ultima_sincronizacao_azure") or _meta(bag, "imported_at"),
        "replanejamentoTotal": sum(float(r.get("replanejamento") or 0) for r in linhas),
        "ttlCts": ttl_cts,
        "gap": gap_total,
        "statusTotais": status_geral,
        "percentBugsDev": sobre_exec(falhas_por("Desenvolvimento Foursys")),
        "percentBugsCliente": sobre_exec(falhas_por("Cliente CVP")),
        "percentTotalImpactados": sobre_exec(len(falhas)),
        "statusGeral": status_geral,
        "totais": totais,
        "percentuais": {"plan": sobre_ttl(totais["ctsPlanAteHoje"]), "real": sobre_ttl(totais["totalRealizado"])},
        "impactos": {
            "totalTestPointFailedBlocked": impacto_total_test_point(exec_rows, plan_key),
            "foursys": kpi["foursys"],
            "cliente": kpi["cliente"],
            "reteste": kpi["reteste"],
        },
        "suites": suites,
        "dimensoes": dimensoes,
        "bugs": _bugs_painel(plan_key, falhas),
        "graficos": {
            "planejadoVsRealizado": planejado_vs_realizado(linhas, exec_rows, plan_key, periodo),
            "statusExecucoes": status_execucoes(totais),
        },
        "gestaoImpactos": _gestao_impactos(plan_key, falhas),
    }


def _bugs_painel(plan_key: str, falhas: list[FalhaRow]) -> dict[str, int]:
    return {
        "total": count_falhas(falhas, {"planKey": plan_key, "idNotEmpty": True}),
        "fechados": count_falhas(falhas, {"planKey": plan_key, "fechamentoNotEmpty": True}),
        "abertosDev": count_falhas(
            falhas,
            {
                "planKey": plan_key,
                "fechamentoEmpty": True,
                "statusNot": "Resolved",
                "responsavel": "Desenvolvimento Foursys",
                "idNotEmpty": True,
            },
        ),
        "fechadosDev": count_falhas(
            falhas,
            {
                "planKey": plan_key,
                "fechamentoEmpty": True,
                "status": "Resolved",
                "responsavel": "Desenvolvimento Foursys",
                "idNotEmpty": True,
            },
        ),
        "abertosCliente": count_falhas(
            falhas,
            {
                "planKey": plan_key,
                "fechamentoEmpty": True,
                "statusNot": "Resolved",
                "responsavel": "Cliente CVP",
                "idNotEmpty": True,
            },
        ),
        "fechadosCliente": count_falhas(falhas, {"planKey": plan_key, "status": "Closed", "responsavel": "Cliente CVP"}),
        "retesteResolved": count_falhas(falhas, {"planKey": plan_key, "status": "Resolved"}),
        "outros": count_falhas(
            falhas,
            {
                "planKey": plan_key,
                "fechamentoEmpty": True,
                "statusNot": "Resolved",
                "responsavel": "Outros",
                "idNotEmpty": True,
            },
        ),
    }


def _gestao_impactos(plan_key: str, falhas: list[FalhaRow]) -> dict[str, Any]:
    bugs = [f for f in falhas if (f.get("plan_key") or "").strip() == plan_key and f.get("bug_id") is not None]
    vazio = lambda v: not (v or "").strip()
    abertos = [f for f in bugs if vazio(f.get("fechamento"))]
    status = lambda f: (f.get("status") or "").strip()
    abertos_por = lambda resp: sum(
        1 for f in abertos if status(f) != "Resolved" and (f.get("responsavel") or "").strip() == resp
    )
    fechados = sum(1 for f in bugs if not vazio(f.get("fechamento")))
    return {
        "cards": {
            "total": len(bugs),
            "fechados": fechados,
            "pendentes": len(bugs) - fechados,
            "emRetestes": sum(1 for f in abertos if status(f) == "Resolved"),
            "abertosDev": abertos_por("Desenvolvimento Foursys"),
            "abertosCliente": abertos_por("Cliente CVP"),
            "abertosOutros": abertos_por("Outros"),
        },
        "frentes": _contar_por(
            [
                {"value": parte.strip()}
                for f in abertos
                for parte in (f.get("frente") or "").split("|")
                if parte.strip()
            ]
        ),
        "status": _contar_por([{"value": status(f) or "(vazio)"} for f in abertos]),
        "categoria": _contar_por([{"value": (f.get("categoria") or "").strip() or "(vazio)"} for f in abertos]),
    }


async def get_status_por_frente(plan_key: str = DEFAULT_PLAN_KEY) -> dict[str, Any]:
    bag = await _load_meta(tuple([*PERIOD_KEYS, "planejamento_legado_plan_key", f"dimensoes_catalog:{plan_key}"]))
    periodo = _periodo_from(bag)
    assert_stored_planning_period(periodo["inicio"], periodo["fim"])
    stores = await _stores()
    exec_rows = await stores["azure_snapshot"].list_execucoes(plan_key)
    dimensoes = _catalog(plan_key, exec_rows, bag)
    linhas = await _build_planejamento(plan_key, exec_rows, dimensoes, bag)
    frente_dim = next((d for d in dimensoes if d.get("role") == "front" and float(d.get("confidence") or 0) >= 0.8), None)
    frentes = frente_dim.get("values", []) if frente_dim else []
    falhas = await stores["azure_snapshot"].list_falhas(plan_key)
    falhas_uat = falhas if plan_key.lower() == "uat" else await stores["azure_snapshot"].list_falhas("UAT")
    blocos = []
    for frente in frentes:
        ttl = sumif_frente(linhas, frente, "qtd_cts_plan")
        cenarios = {
            "ttl": ttl,
            "plan": ttl,
            "planAteHoje": sumif_frente(linhas, frente, "cts_plan_dia"),
            "na": sumif_frente(linhas, frente, "cts_na"),
            "passeds": sumif_frente(linhas, frente, "cts_passeds"),
            "finalizado": finalizados_com_cancelados(
                {"cts_passeds": sumif_frente(linhas, frente, "cts_passeds"), "cts_na": sumif_frente(linhas, frente, "cts_na")},
                sumif_frente(linhas, frente, "cts_cancelados"),
            ),
            "falha": sumif_frente(linhas, frente, "cts_falhados"),
            "bloqueado": sumif_frente(linhas, frente, "cts_bloqueados"),
            "liberado": sumif_frente(linhas, frente, "cts_liberados"),
            "design": sumif_frente(linhas, frente, "cts_design"),
            "naoLib": sumif_frente(linhas, frente, "cts_nao_liberados"),
        }
        bugs = _bugs_por_frente(plan_key, frente, falhas, falhas_uat)
        blocos.append(
            {
                "frente": frente,
                "cenarios": cenarios,
                "bugs": bugs,
                "indicadores": _indicadores_dto(cenarios, bugs),
            }
        )
    total = _somar_blocos(blocos)
    return {"planKey": plan_key, "blocos": blocos, "total": total, "sobreposicao": ha_sobreposicao_frentes(frentes)}


def _bugs_por_frente(plan_key: str, frente: str, falhas: list[FalhaRow], falhas_uat: list[FalhaRow]) -> dict[str, int]:
    base: FalhaFilter = {"planKey": plan_key, "frenteContains": frente, "idNotEmpty": True}
    return {
        "total": count_falhas(falhas, base),
        "fechados": count_falhas(falhas, {**base, "status": "Closed"}),
        "abertosDev": count_falhas(falhas, {**base, "responsavel": "Desenvolvimento Foursys", "status": "New"})
        + count_falhas(falhas, {**base, "responsavel": "Desenvolvimento Foursys", "status": "Active"}),
        "fechadosDev": count_falhas(falhas, {**base, "responsavel": "Desenvolvimento Foursys", "status": "Closed"}),
        "abertosCliente": count_falhas(falhas, {**base, "responsavel": "Cliente CVP", "status": "New"})
        + count_falhas(falhas, {**base, "responsavel": "Cliente CVP", "status": "Active"}),
        "fechadosCliente": count_falhas(falhas, {**base, "responsavel": "Cliente CVP", "status": "Closed"}),
        "reteste": count_falhas(falhas, {**base, "status": "Resolved"}),
        "outrosUat": count_falhas(
            falhas_uat,
            {"planKey": "UAT", "frenteContains": frente, "responsavel": "Outros", "fechamentoNotEmpty": True, "idNotEmpty": True},
        ),
        "impactosDev": count_falhas(falhas, {**base, "responsavel": "Desenvolvimento Foursys"}),
        "impactosCliente": count_falhas(falhas, {**base, "responsavel": "Cliente CVP"}),
    }


def _indicadores_dto(cenarios: Mapping[str, float], bugs: Mapping[str, float]) -> dict[str, Any]:
    ind = indicadores_frente(
        {
            "ttl": float(cenarios.get("ttl", 0)),
            "plan_ate_hoje": float(cenarios.get("planAteHoje", 0)),
            "finalizado": float(cenarios.get("finalizado", 0)),
            "na": float(cenarios.get("na", 0)),
            "passeds": float(cenarios.get("passeds", 0)),
            "falha": float(cenarios.get("falha", 0)),
            "bloqueado": float(cenarios.get("bloqueado", 0)),
            "impactos_dev": float(bugs.get("impactosDev", 0)),
            "impactos_cliente": float(bugs.get("impactosCliente", 0)),
            "bugs_total": float(bugs.get("total", 0)),
            "bugs_fechados": float(bugs.get("fechados", 0)),
        }
    )
    return {
        "planAteHoje": ind["plan_ate_hoje"],
        "na": ind["na"],
        "passeds": ind["passeds"],
        "gap": ind["gap"],
        "pctPlan": ind["pct_plan"],
        "pctReal": ind["pct_real"],
        "pctBugsDev": ind["pct_bugs_dev"],
        "pctBugsCliente": ind["pct_bugs_cliente"],
        "bugsAbertos": ind["bugs_abertos"],
        "status": ind["status"],
    }


def _somar_blocos(blocos: list[dict[str, Any]]) -> dict[str, Any]:
    cenarios_keys = list(blocos[0]["cenarios"].keys()) if blocos else []
    bugs_keys = list(blocos[0]["bugs"].keys()) if blocos else []
    cenarios = {k: 0 for k in cenarios_keys}
    bugs = {k: 0 for k in bugs_keys}
    for bloco in blocos:
        for k in cenarios_keys:
            cenarios[k] += bloco["cenarios"][k]
        for k in bugs_keys:
            bugs[k] += bloco["bugs"][k]
    indicadores = _indicadores_dto(cenarios, bugs)
    if blocos:
        indicadores["status"] = status_geral_de([b["indicadores"]["status"] for b in blocos])
    return {"cenarios": cenarios, "bugs": bugs, "indicadores": indicadores}
