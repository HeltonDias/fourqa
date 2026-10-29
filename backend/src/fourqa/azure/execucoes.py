"""Azure test plan executions (mirrors execucoes.ts — functional port)."""

from __future__ import annotations

import json
from typing import Any, Callable

from fourqa.azure.client import AzureClient
from fourqa.azure.util import empty_to_null, map_in_batches, normalize
from fourqa.domain.dates import persist_timestamp
from fourqa.domain.dimensions import (
    build_dimension_catalog,
    detect_dimensions,
    dimension_definitions_for_plan,
    legacy_role_value,
    resolve_dimension_values,
)

CASE_PRIORITY_REFERENCE = "Microsoft.VSTS.Common.Priority"
SUITE_CONCURRENCY = 4
POINTS_PAGE = 1000


async def load_plan_executions(
    client: AzureClient,
    plan: dict[str, Any],
    hierarchy: list[dict[str, Any]],
    report: Callable[[str, int | None, int | None], None],
    known_fronts: list[str] | None = None,
) -> dict[str, Any]:
    report(f"Execuções ({plan['planKey']}): lendo árvore de suítes", None, None)
    tree = (await client.get(client.url(f"/_apis/testplan/Plans/{plan['planId']}/suites", {"asTreeView": True}))).get("value") or []
    all_paths = _flatten_suite_tree(tree)
    suites = [s for s in all_paths if not (s["suite"].get("children") or [])]
    if plan.get("suiteNameFilter", "").strip():
        filt = normalize(plan["suiteNameFilter"])
        suites = [s for s in suites if filt in normalize(s["suite"].get("name"))]
    if plan.get("maxSuites", 0) > 0:
        suites = suites[: plan["maxSuites"]]
    suggestions = detect_dimensions(
        [{"ancestors": [{"name": str(n.get("name") or "")} for n in s["path"]]} for s in suites],
        {"known_fronts": known_fronts or []},
    )
    definitions = dimension_definitions_for_plan(plan["planKey"], hierarchy)
    path_contexts = [
        {
            "path_names": [str(n.get("name") or "").strip() for n in s["path"]],
            "current_suite_name": str(s["path"][-1].get("name") or "").strip(),
        }
        for s in suites
    ]
    dimensions = build_dimension_catalog(definitions, suggestions, path_contexts)

    async def worker(sp: dict[str, Any]) -> list[dict[str, Any]]:
        suite_id = int(sp["suite"].get("id") or 0)
        if not suite_id:
            return []
        points = await _get_test_points(client, plan["planId"], suite_id)
        return [_build_record(client, plan, definitions, dimensions, suggestions, sp, p) for p in points]

    per_suite = await map_in_batches(suites, SUITE_CONCURRENCY, worker, lambda d, t: report(f"Execuções ({plan['planKey']}): suítes", d, t))
    rows = [r for batch in per_suite for r in batch]
    suite_refs = [
        {
            "suite_id": int(s["suite"].get("id") or 0),
            "parent_suite_id": int(s["path"][-2].get("id") or 0) if len(s["path"]) >= 2 else None,
        }
        for s in all_paths
        if int(s["suite"].get("id") or 0) > 0
    ]
    return {"plan": plan, "rows": rows, "suitesProcessed": len(suites), "suites": suite_refs, "dimensions": dimensions}


def _flatten_suite_tree(roots: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []

    def walk(suite: dict[str, Any], parent: list[dict[str, Any]]) -> None:
        current = [*parent, suite]
        out.append({"suite": suite, "path": current})
        for child in suite.get("children") or []:
            walk(child, current)

    for root in roots:
        children = root.get("children") or []
        if not children:
            walk(root, [])
        else:
            for child in children:
                walk(child, [])
    return out


async def _get_test_points(client: AzureClient, plan_id: int, suite_id: int) -> list[dict[str, Any]]:
    all_pts: list[dict[str, Any]] = []
    skip = 0
    while True:
        data = await client.get(
            client.url(
                f"/_apis/test/Plans/{plan_id}/Suites/{suite_id}/points",
                {
                    "witFields": f"System.Title,System.State,System.Tags,{CASE_PRIORITY_REFERENCE}",
                    "includePointDetails": True,
                    "$skip": skip,
                    "$top": POINTS_PAGE,
                },
            )
        )
        page = data.get("value") or []
        all_pts.extend(page)
        if len(page) < POINTS_PAGE:
            break
        skip += POINTS_PAGE
    return all_pts


def _build_record(client: AzureClient, plan: dict[str, Any], definitions, catalog, suggestions, sp, point) -> dict[str, Any]:
    path_names = [str(s.get("name") or "").strip() for s in sp["path"]]
    leaf = sp["path"][-1]
    parent = sp["path"][-2] if len(sp["path"]) >= 2 else None
    suite_name = str(leaf.get("name") or "").strip()
    classificacao = resolve_dimension_values(
        {"path_names": path_names, "current_suite_name": suite_name},
        definitions,
        suggestions,
    )
    suite_path = [
        {"suiteId": int(s.get("id") or 0), "name": str(s.get("name") or ""), "parentSuiteId": int(sp["path"][i - 1].get("id") or 0) if i else None, "depth": i + 1}
        for i, s in enumerate(sp["path"])
    ]
    test_case_id = int((point.get("testCase") or {}).get("id") or 0)
    return {
        "plan_key": plan["planKey"],
        "plan_id": plan["planId"],
        "plan_name": empty_to_null(plan.get("planName") or ""),
        "frente": empty_to_null(legacy_role_value("front", classificacao, definitions, catalog)),
        "atalho": empty_to_null(_extract_atalho(suite_name)),
        "processo": empty_to_null(legacy_role_value("process", classificacao, definitions, catalog)),
        "suite_id": int(leaf.get("id") or 0) or None,
        "suite_name": empty_to_null(suite_name),
        "parent_suite_id": int(parent.get("id") or 0) if parent else None,
        "suite_depth": len(sp["path"]),
        "suite_path": json.dumps(suite_path),
        "dimensions_json": json.dumps(classificacao),
        "test_point_id": int(point.get("id") or 0) or None,
        "test_case_id": test_case_id or None,
        "test_case_title": empty_to_null(str((point.get("testCase") or {}).get("name") or "")),
        "case_priority": None,
        "responsabilidade": None,
        "test_case_state": empty_to_null(""),
        "test_point_state": empty_to_null(str(point.get("state") or "")),
        "outcome": empty_to_null(str(point.get("outcome") or "")),
        "date_completed": empty_to_null(persist_timestamp((point.get("lastResultDetails") or {}).get("dateCompleted") or "")),
        "run_by": empty_to_null(""),
        "last_updated_date": empty_to_null(persist_timestamp(point.get("lastUpdatedDate") or "")),
        "last_test_run_id": None,
        "last_result_id": None,
        "test_case_link": empty_to_null((point.get("testCase") or {}).get("webUrl") or client.work_item_link(test_case_id) if test_case_id else ""),
        "test_case_tags": empty_to_null(""),
    }


def _extract_atalho(name: str) -> str:
    text = name.strip()
    if not text:
        return ""
    idx = text.find(" - ")
    return text[:idx].strip() if idx >= 0 else text
