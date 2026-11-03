"""Durable sync job state in Postgres (mirrors syncJob.ts)."""

from __future__ import annotations

import json
import os
import uuid
from datetime import datetime, timezone
from typing import Any, Literal

from fourqa.db.postgres.postgres_azure_snapshot_store import apply_azure_snapshot_on_client
from fourqa.db.postgres.pool import query, with_transaction
from fourqa.persistence.contracts import AzureSnapshot
from fourqa.persistence.meta_scope import scoped_meta_key

SYNC_HEARTBEAT_STALE_MS = 90_000
SYNC_JOB_KEY = "sync_job"
UPSERT = """
INSERT INTO workbook_meta (key, value) VALUES ($1, $2)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
"""
REPLACE_LOCK = "LOCK TABLE execucoes, falhas, workbook_meta IN EXCLUSIVE MODE"

SyncStatus = Literal["idle", "running", "success", "error"]


def _job_key() -> str:
    return scoped_meta_key(SYNC_JOB_KEY)


def is_durable_sync_runtime() -> bool:
    return os.environ.get("VERCEL") == "1"


def empty_sync_state() -> dict[str, Any]:
    return {
        "status": "idle",
        "startedAt": None,
        "finishedAt": None,
        "step": "",
        "progress": None,
        "summary": None,
        "error": None,
    }


def _progress_of(value: Any) -> dict[str, int] | None:
    if not isinstance(value, dict):
        return None
    if not isinstance(value.get("done"), (int, float)) or not isinstance(value.get("total"), (int, float)):
        return None
    return {"done": int(value["done"]), "total": int(value["total"])}


def parse_sync_job(raw: str | None) -> dict[str, Any]:
    if not raw:
        return {**empty_sync_state(), "beatAt": None, "jobId": None}
    try:
        value = json.loads(raw)
    except json.JSONDecodeError:
        return {**empty_sync_state(), "beatAt": None, "jobId": None}
    status = value.get("status")
    if status not in ("idle", "running", "success", "error"):
        return {**empty_sync_state(), "beatAt": None, "jobId": None}
    return {
        "status": status,
        "startedAt": value.get("startedAt") if isinstance(value.get("startedAt"), str) else None,
        "finishedAt": value.get("finishedAt") if isinstance(value.get("finishedAt"), str) else None,
        "step": value.get("step") if isinstance(value.get("step"), str) else "",
        "progress": _progress_of(value.get("progress")),
        "summary": value.get("summary"),
        "error": value.get("error") if isinstance(value.get("error"), str) else None,
        "beatAt": value.get("beatAt") if isinstance(value.get("beatAt"), str) else None,
        "jobId": value.get("jobId") if isinstance(value.get("jobId"), str) else None,
    }


def is_sync_job_alive(job: dict[str, Any], now_ms: int, stale_ms: int) -> bool:
    if job.get("status") != "running":
        return False
    beat = job.get("beatAt") or job.get("startedAt") or ""
    try:
        ts = datetime.fromisoformat(beat.replace("Z", "+00:00")).timestamp() * 1000
    except ValueError:
        return False
    return now_ms - ts < stale_ms


def visible_sync_job(job: dict[str, Any], now_ms: int, stale_ms: int) -> dict[str, Any]:
    state = {k: job[k] for k in empty_sync_state().keys()}
    if job.get("status") != "running":
        return state
    if is_sync_job_alive(job, now_ms, stale_ms):
        return state
    return {
        **state,
        "status": "error",
        "finishedAt": datetime.fromtimestamp(now_ms / 1000, tz=timezone.utc).isoformat(),
        "progress": None,
        "error": "Sincronização interrompida antes de concluir. Os dados anteriores permanecem. Tente novamente.",
    }


def running_sync_job(now: datetime, job_id: str) -> dict[str, Any]:
    at = now.isoformat()
    return {**empty_sync_state(), "status": "running", "startedAt": at, "step": "Iniciando", "beatAt": at, "jobId": job_id}


async def read_sync_job(now_ms: int | None = None, stale_ms: int = SYNC_HEARTBEAT_STALE_MS) -> dict[str, Any]:
    now_ms = now_ms if now_ms is not None else int(datetime.now(tz=timezone.utc).timestamp() * 1000)
    rows = await query("SELECT value FROM workbook_meta WHERE key = $1", [_job_key()])
    raw = rows[0]["value"] if rows else None
    return visible_sync_job(parse_sync_job(raw if isinstance(raw, str) else None), now_ms, stale_ms)


async def save_sync_job_if_owner(job: dict[str, Any], now_ms: int | None = None, stale_ms: int = SYNC_HEARTBEAT_STALE_MS) -> bool:
    now_ms = now_ms if now_ms is not None else int(datetime.now(tz=timezone.utc).timestamp() * 1000)

    async def work(conn):
        cur = await conn.execute("SELECT value FROM workbook_meta WHERE key = $1 FOR UPDATE", (_job_key(),))
        row = await cur.fetchone()
        current = parse_sync_job(row["value"] if row else None)
        if not (
            current.get("status") == "running"
            and current.get("jobId") == job.get("jobId")
            and is_sync_job_alive(current, now_ms, stale_ms)
        ):
            return False
        beat = job.get("beatAt") or datetime.fromtimestamp(now_ms / 1000, tz=timezone.utc).isoformat()
        payload = {**job, "beatAt": beat}
        await conn.execute(UPSERT, (_job_key(), json.dumps(payload)))
        return True

    return await with_transaction(work)


async def fail_sync_job_if_owner(job_id: str, error: str, now_ms: int | None = None) -> bool:
    now_ms = now_ms if now_ms is not None else int(datetime.now(tz=timezone.utc).timestamp() * 1000)

    async def work(conn):
        cur = await conn.execute("SELECT value FROM workbook_meta WHERE key = $1 FOR UPDATE", (_job_key(),))
        row = await cur.fetchone()
        current = parse_sync_job(row["value"] if row else None)
        if current.get("status") != "running" or current.get("jobId") != job_id:
            return False
        failed = {
            **current,
            "status": "error",
            "finishedAt": datetime.fromtimestamp(now_ms / 1000, tz=timezone.utc).isoformat(),
            "progress": None,
            "beatAt": datetime.fromtimestamp(now_ms / 1000, tz=timezone.utc).isoformat(),
            "error": error,
        }
        await conn.execute(UPSERT, (_job_key(), json.dumps(failed)))
        return True

    return await with_transaction(work)


async def publish_sync_if_owner(
    job_id: str,
    snapshot: AzureSnapshot,
    success: dict[str, Any],
    now_ms: int | None = None,
    stale_ms: int = SYNC_HEARTBEAT_STALE_MS,
) -> bool:
    now_ms = now_ms if now_ms is not None else int(datetime.now(tz=timezone.utc).timestamp() * 1000)

    async def work(conn):
        cur = await conn.execute("SELECT value FROM workbook_meta WHERE key = $1 FOR UPDATE", (_job_key(),))
        row = await cur.fetchone()
        current = parse_sync_job(row["value"] if row else None)
        if current.get("status") != "running" or current.get("jobId") != job_id or not is_sync_job_alive(current, now_ms, stale_ms):
            return False
        await apply_azure_snapshot_on_client(conn, snapshot)
        payload = {**success, "jobId": job_id, "beatAt": success.get("beatAt") or datetime.fromtimestamp(now_ms / 1000, tz=timezone.utc).isoformat()}
        await conn.execute(UPSERT, (_job_key(), json.dumps(payload)))
        return True

    return await with_transaction(work, REPLACE_LOCK)


async def claim_sync_job(now: datetime | None = None, stale_ms: int = SYNC_HEARTBEAT_STALE_MS) -> dict[str, Any]:
    now = now or datetime.now(tz=timezone.utc)
    job_id = uuid.uuid4().hex

    async def work(conn):
        await conn.execute(
            "INSERT INTO workbook_meta (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING",
            (_job_key(), json.dumps({**empty_sync_state(), "beatAt": None, "jobId": None})),
        )
        cur = await conn.execute("SELECT value FROM workbook_meta WHERE key = $1 FOR UPDATE", (_job_key(),))
        row = await cur.fetchone()
        current = parse_sync_job(row["value"] if row else None)
        visible = visible_sync_job(current, int(now.timestamp() * 1000), stale_ms)
        if visible.get("status") == "running":
            return {"started": False, "state": visible, "jobId": None}
        nxt = running_sync_job(now, job_id)
        await conn.execute(UPSERT, (_job_key(), json.dumps(nxt)))
        return {"started": True, "state": visible_sync_job(nxt, int(now.timestamp() * 1000), stale_ms), "jobId": job_id}

    return await with_transaction(work)
