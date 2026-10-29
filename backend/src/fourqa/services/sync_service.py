"""Sync orchestration (mirrors syncService.ts)."""

from __future__ import annotations

import asyncio
import os
from datetime import datetime, timezone
from typing import Any

from fourqa.azure.azure_cache_consistency import persist_validated_sync_batch
from fourqa.azure.azure_cache_mirror import is_azure_cache_mirror_enabled
from fourqa.azure.azure_cache_read_source import is_azure_cache_read_enabled
from fourqa.azure.azure_data_refresh import build_azure_refresh_draft
from fourqa.azure.client import AzureClient, AzureHttpError
from fourqa.azure.config import SyncConfigError, load_sync_config
from fourqa.azure.in_memory_azure_cache import get_in_memory_azure_cache
from fourqa.azure.sync_parameters import SYNC_PARAMETERS_KEY, decode_stored_parameters, parameters_to_override
from fourqa.domain.validate_sync import SyncValidationError
from fourqa.persistence.provider import get_durable_azure_snapshot, get_stores
from fourqa.services import sync_job

_state: dict[str, Any] = {
    "status": "idle",
    "startedAt": None,
    "finishedAt": None,
    "step": "",
    "progress": None,
    "summary": None,
    "error": None,
}


async def get_sync_state() -> dict[str, Any]:
    if not sync_job.is_durable_sync_runtime():
        return dict(_state)
    return await sync_job.read_sync_job()


def _patch(p: dict[str, Any]) -> None:
    global _state
    _state = {**_state, **p}


def _user_message(err: BaseException) -> str:
    if isinstance(err, (SyncConfigError, AzureHttpError, SyncValidationError)):
        return str(err)
    return "Falha inesperada durante a sincronização com o Azure DevOps. Consulte o log do servidor."


async def _load_effective_sync_config() -> dict[str, Any]:
    stores = await get_stores()
    raw = await stores["meta"].get(SYNC_PARAMETERS_KEY)
    decoded = decode_stored_parameters(raw if isinstance(raw, str) else None)
    override = parameters_to_override(decoded["draft"]) if decoded.get("draft") else None
    return load_sync_config(override)


async def start_sync() -> dict[str, Any]:
    global _state
    if sync_job.is_durable_sync_runtime():
        return await _start_durable_sync()
    if _state.get("status") == "running":
        return {"started": False, "state": dict(_state)}
    cfg = await _load_effective_sync_config()
    started_at = datetime.now(tz=timezone.utc)
    _state = {
        "status": "running",
        "startedAt": started_at.isoformat(),
        "finishedAt": None,
        "step": "Iniciando",
        "progress": None,
        "summary": None,
        "error": None,
    }
    asyncio.create_task(_run_sync_safe(cfg, started_at))
    return {"started": True, "state": dict(_state)}


async def _run_sync_safe(cfg: dict[str, Any], started_at: datetime, durable_job_id: str | None = None) -> None:
    try:
        await run_sync(cfg, started_at, durable_job_id)
    except Exception as err:
        _patch({"status": "error", "finishedAt": datetime.now(tz=timezone.utc).isoformat(), "progress": None, "error": _user_message(err)})


async def _start_durable_sync() -> dict[str, Any]:
    global _state
    cfg = await _load_effective_sync_config()
    started_at = datetime.now(tz=timezone.utc)
    claimed = await sync_job.claim_sync_job(started_at)
    if not claimed.get("started") or not claimed.get("jobId"):
        return {"started": False, "state": claimed["state"]}
    _state = claimed["state"]
    asyncio.create_task(_run_sync_safe(cfg, started_at, claimed["jobId"]))
    return {"started": True, "state": claimed["state"]}


async def run_sync(cfg: dict[str, Any], started_at: datetime, durable_job_id: str | None = None) -> None:
    client = AzureClient(cfg["azure"])
    durable = sync_job.is_durable_sync_runtime()
    queue: asyncio.Future | None = None
    accept_beat = True

    def stored_job() -> dict[str, Any]:
        return {**_state, "beatAt": datetime.now(tz=timezone.utc).isoformat(), "jobId": durable_job_id}

    async def persist_job() -> None:
        if durable and durable_job_id:
            await sync_job.save_sync_job_if_owner(stored_job())

    def report(step: str, done: int | None = None, total: int | None = None) -> None:
        _patch({"step": step, "progress": {"done": done, "total": total} if done is not None and total is not None else None})
        asyncio.create_task(persist_job())

    cache = get_in_memory_azure_cache()
    cache_read = is_azure_cache_read_enabled()
    locked = False
    if cache_read:
        cache.begin_refresh()
        locked = True
    try:
        draft, artifacts = await build_azure_refresh_draft(client, cfg, report)
        report("Validando integridade antes de gravar")
        report("Publicando a atualização" if cache_read else "Gravando no banco de dados")
        durable_snapshot = await get_durable_azure_snapshot()
        publish_payload: dict[str, Any] | None = None

        async def replace(input: dict[str, Any]) -> None:
            nonlocal publish_payload
            if durable and durable_job_id:
                publish_payload = input
                return
            await durable_snapshot.replace_snapshot(input)  # type: ignore[union-attr]

        await persist_validated_sync_batch(
            draft,
            artifacts,
            {
                "replace_snapshot": replace,
                "mirror_enabled": is_azure_cache_mirror_enabled,
                "cache_read_enabled": lambda: cache_read,
                "cache": cache,
            },
        )
        finished_at = datetime.now(tz=timezone.utc)
        summary = {
            **artifacts["summary"],
            "duracaoMs": int((finished_at - started_at).total_seconds() * 1000),
        }
        if durable and durable_job_id and publish_payload:
            success_job = {
                **stored_job(),
                "status": "success",
                "finishedAt": finished_at.isoformat(),
                "step": "Concluído",
                "progress": None,
                "summary": summary,
                "error": None,
            }
            published = await sync_job.publish_sync_if_owner(durable_job_id, publish_payload, success_job, int(finished_at.timestamp() * 1000))
            if not published:
                return
            _patch({"status": "success", "finishedAt": success_job["finishedAt"], "step": "Concluído", "progress": None, "summary": summary})
        else:
            _patch({"status": "success", "finishedAt": finished_at.isoformat(), "step": "Concluído", "progress": None, "summary": summary})
    except Exception as err:
        if locked:
            cache.mark_refresh_failed()
        if durable and durable_job_id:
            await sync_job.fail_sync_job_if_owner(durable_job_id, _user_message(err))
            _patch({"status": "error", "finishedAt": datetime.now(tz=timezone.utc).isoformat(), "progress": None, "error": _user_message(err)})
        else:
            raise
    finally:
        if locked:
            cache.end_refresh()
