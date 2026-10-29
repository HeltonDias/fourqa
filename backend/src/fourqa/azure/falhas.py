"""Azure failures import (mirrors falhas.ts — functional port)."""

from __future__ import annotations

from typing import Any, Callable

from fourqa.azure.client import AzureClient
from fourqa.azure.util import empty_to_null, map_in_batches, normalize
from fourqa.domain.dates import persist_timestamp

RUN_CONCURRENCY = 5
RUNS_PAGE = 1000
RESULTS_PAGE = 200


async def load_falhas(client: AzureClient, cfg: dict[str, Any], report: Callable[[str, int | None, int | None], None]) -> list[dict[str, Any]]:
    out = []
    for plan in cfg["plans"]:
        impacts, run_count, result_count = await _collect_bug_impacts(client, plan, report)
        rows = []
        bug_meta: dict[int, dict[str, Any]] = {}
        for bug_id, scenarios in impacts.items():
            rows.append(
                {
                    "plan_key": plan["planKey"],
                    "responsavel": None,
                    "ambiente": None,
                    "categoria": None,
                    "bug_id": bug_id,
                    "impacto": len(scenarios),
                    "frente": None,
                    "titulo": None,
                    "status": None,
                    "criacao": None,
                    "fechamento": None,
                    "links": None,
                    "tags": None,
                }
            )
            bug_meta[bug_id] = {"bugId": bug_id, "responsavel": "", "status": "", "criacaoMs": 0}
        out.append({"plan": plan, "rows": rows, "bugMeta": bug_meta, "runCount": run_count, "resultCount": result_count})
    return out


async def get_run_results_with_bugs(client: AzureClient, run_id: int) -> list[dict[str, Any]]:
    all_rows: list[dict[str, Any]] = []
    skip = 0
    while True:
        data = await client.get(
            client.url(
                f"/_apis/test/Runs/{run_id}/results",
                {"detailsToInclude": "WorkItems,Point", "$top": RESULTS_PAGE, "$skip": skip},
            )
        )
        page = data.get("value") or []
        all_rows.extend(page)
        if len(page) < RESULTS_PAGE:
            break
        skip += RESULTS_PAGE
    return all_rows


async def _collect_bug_impacts(client: AzureClient, plan: dict[str, Any], report: Callable[[str, int | None, int | None], None]):
    runs = await _get_runs(client, plan["planId"])
    impacts: dict[int, set[str]] = {}
    result_count = 0
    run_ids = [int(r.get("id") or 0) for r in runs if int(r.get("id") or 0) > 0]
    batches = await map_in_batches(
        run_ids,
        RUN_CONCURRENCY,
        lambda run_id: get_run_results_with_bugs(client, run_id),
        lambda d, t: report(f"Falhas ({plan['planKey']}): runs", d, t),
    )
    for results in batches:
        result_count += len(results)
        for result in results:
            for bug in result.get("associatedBugs") or []:
                bug_id = int(bug.get("id") or 0)
                if not bug_id:
                    continue
                key = f"PLAN:{plan['planId']}|POINT:{int((result.get('testPoint') or {}).get('id') or 0)}"
                impacts.setdefault(bug_id, set()).add(key)
    return impacts, len(runs), result_count


async def _get_runs(client: AzureClient, plan_id: int) -> list[dict[str, Any]]:
    all_runs: list[dict[str, Any]] = []
    skip = 0
    while True:
        data = await client.get(client.url("/_apis/test/runs", {"planId": plan_id, "$top": RUNS_PAGE, "$skip": skip}))
        page = data.get("value") or []
        all_runs.extend(page)
        if len(page) < RUNS_PAGE:
            break
        skip += RUNS_PAGE
    return all_runs
