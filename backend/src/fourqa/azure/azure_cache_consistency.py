"""Cache vs DB publish policy (mirrors azureCacheConsistency.ts)."""

from __future__ import annotations

from typing import Any, Awaitable, Callable


async def persist_validated_sync_batch(draft: dict[str, Any], artifacts: dict[str, Any], deps: dict[str, Any]) -> None:
    cache = deps["cache"]
    replace_snapshot: Callable[[dict[str, Any]], Awaitable[None]] = deps["replace_snapshot"]
    if deps.get("cache_read_enabled") and deps["cache_read_enabled"]():
        execucoes = [r for plan in draft["plans"] for r in plan["execucoes"]]
        falhas = [r for plan in draft["plans"] for r in plan["falhas"]]
        await replace_snapshot({"execucoes": execucoes, "falhas": falhas, "meta": artifacts["workbookMeta"]})
        cache.commit_successful_refresh(draft, artifacts)
        return
    execucoes = [r for plan in draft["plans"] for r in plan["execucoes"]]
    falhas = [r for plan in draft["plans"] for r in plan["falhas"]]
    cache.begin_publish()
    try:
        await replace_snapshot({"execucoes": execucoes, "falhas": falhas, "meta": artifacts["workbookMeta"]})
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
