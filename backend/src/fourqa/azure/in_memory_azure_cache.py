"""In-memory Azure cache (mirrors inMemoryAzureCache.ts)."""

from __future__ import annotations

from copy import deepcopy
from typing import Any

from fourqa.azure.plan_key_match import plan_key_match

_shared: "InMemoryAzureCache | None" = None


class InMemoryAzureCache:
    def __init__(self) -> None:
        self._plans: dict[str, dict[str, Any]] = {}
        self._fetched_at: str | None = None
        self._stale = False
        self._kpi_plan_key: str | None = None
        self._refreshing = False
        self._publishing = False
        self._generation_meta: dict[str, str] | None = None

    def find_plan_key(self, plan_key: str) -> str | None:
        trimmed = plan_key.strip()
        if not trimmed:
            return None
        if trimmed in self._plans:
            return trimmed
        hits = [k for k in self._plans if plan_key_match(k, trimmed)]
        if len(hits) > 1:
            raise RuntimeError("PlanKey ambíguo no cache")
        return hits[0] if hits else None

    def get_plan(self, plan_key: str) -> dict[str, Any]:
        key = self.find_plan_key(plan_key)
        if not key:
            return _empty_snapshot(plan_key.strip())
        row = self._plans.get(key)
        if not row:
            return _empty_snapshot(key)
        return _clone_public_plan(key, row)

    def list_loaded_plan_keys(self) -> list[str]:
        return sorted(self._plans.keys())

    def get_refresh_meta(self) -> dict[str, Any]:
        return {"fetchedAt": self._fetched_at, "stale": self._stale, "kpiPlanKey": self._kpi_plan_key}

    def commit_successful_refresh(self, draft: dict[str, Any], artifacts: dict[str, Any]) -> None:
        at = artifacts["fetchedAt"]
        next_plans: dict[str, dict[str, Any]] = {}
        for plan in draft["plans"]:
            next_plans[plan["planKey"]] = {
                "state": "loaded",
                "execucoes": [deepcopy(r) for r in plan["execucoes"]],
                "falhas": [deepcopy(r) for r in plan["falhas"]],
                "dimensions": [deepcopy(r) for r in plan["dimensions"]],
                "kpi": deepcopy(plan["kpi"]) if plan.get("kpi") else None,
                "fetchedAt": at,
            }
        self._plans = {**self._plans, **next_plans}
        self._fetched_at = at
        self._stale = False
        self._kpi_plan_key = draft["kpiPlanKey"]
        self._generation_meta = {**(self._generation_meta or {}), **artifacts["workbookMeta"]}

    def has_published_generation(self) -> bool:
        return self._generation_meta is not None

    def read_generation(self) -> dict[str, dict[str, str]] | None:
        if not self._generation_meta:
            return None
        return {"meta": dict(self._generation_meta)}

    def mark_refresh_failed(self) -> None:
        if not self._plans:
            return
        self._stale = True
        at = self._fetched_at
        for key, row in list(self._plans.items()):
            if row.get("state") == "loaded":
                self._plans[key] = {**row, "state": "stale"}
        self._fetched_at = at

    def begin_refresh(self) -> None:
        if self._refreshing:
            raise RuntimeError("Refresh Azure já em andamento.")
        self._refreshing = True

    def end_refresh(self) -> None:
        self._refreshing = False

    def is_refreshing(self) -> bool:
        return self._refreshing

    def begin_publish(self) -> None:
        self._publishing = True

    def end_publish(self) -> None:
        self._publishing = False


def get_in_memory_azure_cache() -> InMemoryAzureCache:
    global _shared
    if _shared is None:
        _shared = InMemoryAzureCache()
    return _shared


def reset_in_memory_azure_cache() -> None:
    global _shared
    _shared = None


def _empty_snapshot(plan_key: str) -> dict[str, Any]:
    return {
        "planKey": plan_key,
        "state": "empty",
        "execucoes": [],
        "falhas": [],
        "dimensions": [],
        "kpi": None,
        "fetchedAt": None,
    }


def _clone_public_plan(plan_key: str, row: dict[str, Any]) -> dict[str, Any]:
    return {
        "planKey": plan_key,
        "state": row["state"],
        "execucoes": [deepcopy(x) for x in row["execucoes"]],
        "falhas": [deepcopy(x) for x in row["falhas"]],
        "dimensions": [deepcopy(x) for x in row["dimensions"]],
        "kpi": deepcopy(row["kpi"]) if row.get("kpi") else None,
        "fetchedAt": row["fetchedAt"],
    }
