"""KPI impact calculation (mirrors kpis.ts)."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Callable

from fourqa.azure.falhas import get_run_results_with_bugs
from fourqa.azure.util import map_in_batches, normalize

KPI_RUN_CONCURRENCY = 4


async def calculate_kpi_impactos(
    client: Any,
    exec_rows: list[dict[str, Any]],
    bug_meta: dict[int, dict[str, Any]],
    report: Callable[[str, int | None, int | None], None],
) -> dict[str, Any]:
    scenarios = [
        {"runId": r.get("last_test_run_id") or 0, "resultId": r.get("last_result_id") or 0}
        for r in exec_rows
        if normalize(r.get("outcome") or "") in ("failed", "blocked")
    ]
    stats = {
        "total": len(scenarios),
        "foursys": 0,
        "cliente": 0,
        "reteste": 0,
        "semResultadoMapeado": 0,
        "calculadoEm": datetime.now(tz=timezone.utc).isoformat(),
    }
    if not scenarios:
        return stats
    run_ids = sorted({s["runId"] for s in scenarios if s["runId"] > 0})
    bugs_by_result: dict[str, list[int]] = {}
    per_run = await map_in_batches(
        run_ids,
        KPI_RUN_CONCURRENCY,
        lambda run_id: _load_run(client, run_id),
        lambda d, t: report("KPIs da Home: runs", d, t),
    )
    for run_id, results in per_run:
        for result in results:
            rid = int(result.get("id") or 0)
            if rid <= 0:
                continue
            ids = sorted({int(b.get("id") or 0) for b in result.get("associatedBugs") or [] if int(b.get("id") or 0) > 0})
            bugs_by_result[f"{run_id}|{rid}"] = ids
    for s in scenarios:
        ids = bugs_by_result.get(f"{s['runId']}|{s['resultId']}") if s["runId"] > 0 and s["resultId"] > 0 else None
        if not ids:
            stats["reteste"] += 1
            stats["semResultadoMapeado"] += 1
            continue
        bugs = [bug_meta[i] for i in ids if i in bug_meta]
        bucket = _classify_bugs(bugs)
        stats[{"Foursys": "foursys", "Cliente": "cliente", "Reteste": "reteste"}[bucket]] += 1
    return stats


async def _load_run(client: Any, run_id: int) -> tuple[int, list[dict[str, Any]]]:
    return run_id, await get_run_results_with_bugs(client, run_id)


def _classify_bugs(bugs: list[dict[str, Any]]) -> str:
    open_bugs = [b for b in bugs if normalize(b.get("status") or "") in ("new", "active")]
    open_bugs.sort(key=lambda b: (b.get("criacaoMs") or 0, b.get("bugId") or 0), reverse=True)
    if not open_bugs:
        return "Reteste"
    resp = normalize(open_bugs[0].get("responsavel") or "")
    if "foursys" in resp:
        return "Foursys"
    if "cliente" in resp or "cvp" in resp:
        return "Cliente"
    return "Reteste"
