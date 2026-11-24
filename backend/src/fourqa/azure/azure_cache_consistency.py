"""Cache vs DB publish policy (mirrors azureCacheConsistency.ts)."""

from __future__ import annotations

from typing import Any, Awaitable, Callable


def _snapshot(draft: dict[str, Any], artifacts: dict[str, Any]) -> dict[str, Any]:
    return {
        "execucoes": [r for plan in draft["plans"] for r in plan["execucoes"]],
        "falhas": [r for plan in draft["plans"] for r in plan["falhas"]],
        "meta": artifacts["workbookMeta"],
        "plan_keys": [plan["planKey"] for plan in draft["plans"]],
    }


async def persist_validated_sync_batch(draft: dict[str, Any], artifacts: dict[str, Any], deps: dict[str, Any]) -> None:
    cache = deps["cache"]
    replace_snapshot: Callable[[dict[str, Any]], Awaitable[None]] = deps["replace_snapshot"]
    if deps.get("cache_read_enabled") and deps["cache_read_enabled"]():
        await replace_snapshot(_snapshot(draft, artifacts))
        cache.commit_successful_refresh(draft, artifacts)
        return
    cache.begin_publish()
    try:
        await replace_snapshot(_snapshot(draft, artifacts))
        if not deps["mirror_enabled"]():
            cache.mark_refresh_failed()
            return
        try:
            if cache.is_refreshing():
                raise RuntimeError("Cache Azure ocupado por outro refresh.")
            cache.commit_successful_refresh(draft, artifacts)
        except Exception:
            cache.mark_refresh_failed()
    finally:
        cache.end_publish()
