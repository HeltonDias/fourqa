"""Azure refresh draft builder (mirrors azureDataRefresh.ts)."""

from __future__ import annotations

from typing import Any, Callable

from fourqa.azure.client import AzureClient
from fourqa.azure.execucoes import load_plan_executions
from fourqa.azure.falhas import load_falhas
from fourqa.azure.kpis import calculate_kpi_impactos
from fourqa.azure.plan_key_match import plan_key_match
from fourqa.domain.validate_sync import validate_sync_result

KPI_META_PREFIX = "kpi_impactos:"


async def build_azure_refresh_draft(
    client: AzureClient,
    cfg: dict[str, Any],
    report: Callable[[str, int | None, int | None], None] | None = None,
) -> tuple[dict[str, Any], dict[str, Any]]:
    report = report or (lambda *_a, **_k: None)
    execucoes: list[dict[str, Any]] = []
    suite_refs: list[dict[str, Any]] = []
    dimensoes_meta: dict[str, str] = {}
    per_plan_exec: dict[str, Any] = {}
    suites = 0
    for plan in cfg["plans"]:
        load = await load_plan_executions(client, plan, cfg["hierarchy"], report, cfg.get("validFronts") or [])
        per_plan_exec[plan["planKey"]] = load
        execucoes.extend(load["rows"])
        suite_refs.extend(load["suites"])
        suites += load["suitesProcessed"]
        dimensoes_meta[f"dimensoes_catalog:{plan['planKey']}"] = __import__("json").dumps(load["dimensions"])
    plan_falhas = await load_falhas(client, cfg, report)
    falhas = [row for p in plan_falhas for row in p["rows"]]
    runs = sum(p["runCount"] for p in plan_falhas)
    kpi_plan = next((p for p in plan_falhas if plan_key_match(p["plan"]["planKey"], cfg["kpiPlanKey"])), None)
    bug_meta = kpi_plan["bugMeta"] if kpi_plan else {}
    kpi_execs = [e for e in execucoes if plan_key_match(e.get("plan_key") or "", cfg["kpiPlanKey"])]
    kpi = await calculate_kpi_impactos(client, kpi_execs, bug_meta, report)
    validate_sync_result(execucoes=execucoes, falhas=falhas, suites=suite_refs)
    fetched_at = __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat()
    plans = []
    for plan in cfg["plans"]:
        exec_load = per_plan_exec[plan["planKey"]]
        fail_load = next((p for p in plan_falhas if plan_key_match(p["plan"]["planKey"], plan["planKey"])), None)
        plans.append(
            {
                "planKey": plan["planKey"],
                "execucoes": exec_load["rows"],
                "falhas": fail_load["rows"] if fail_load else [],
                "dimensions": exec_load["dimensions"],
                "kpi": kpi if plan_key_match(plan["planKey"], cfg["kpiPlanKey"]) else None,
            }
        )
    artifacts = {
        "fetchedAt": fetched_at,
        "dimensoesMeta": dimensoes_meta,
        "workbookMeta": {
            **{f"{KPI_META_PREFIX}{cfg['kpiPlanKey']}": __import__("json").dumps(kpi)},
            "kpi_plan_key": cfg["kpiPlanKey"],
            "ultima_sincronizacao_azure": fetched_at,
            **dimensoes_meta,
        },
        "summary": {"execucoes": len(execucoes), "falhas": len(falhas), "suites": suites, "runs": runs, "kpi": kpi},
    }
    draft = {"kpiPlanKey": cfg["kpiPlanKey"], "plans": plans, "suiteRefs": suite_refs}
    return draft, artifacts
