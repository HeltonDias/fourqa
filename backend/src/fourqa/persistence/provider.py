"""Persistence provider (mirrors backend/src/persistence/provider.ts)."""

from __future__ import annotations

import re
from typing import Literal

from fourqa.azure.config import env_value
from fourqa.persistence.contracts import AzureSnapshotStore, PersistenceStores

ProviderName = Literal["sqlite", "postgres"]

_cached: dict[str, object] | None = None


class PersistenceProviderError(Exception):
    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.name = "PersistenceProviderError"


def public_db_error(err: BaseException) -> str:
    message = str(err) if err else "erro de banco"
    message = re.sub(r"postgres(?:ql)?://\S+", "postgresql://***", message, flags=re.I)
    message = re.sub(r"password[=:]\s*\S+", "password=***", message, flags=re.I)
    return message


def resolve_db_provider(value: str) -> ProviderName:
    name = value.strip().lower()
    if name in ("", "sqlite"):
        return "sqlite"
    if name == "postgres":
        return "postgres"
    raise PersistenceProviderError(f'DB_PROVIDER "{value.strip()}" is not supported.')


def _wrap_sync_stores(raw: PersistenceStores) -> PersistenceStores:
    meta = raw["meta"]
    azure = raw["azure_snapshot"]
    legacy = raw["legacy_plan"]
    planning = raw["planning"]

    def _call(store: object, name: str, *args: object):
        if isinstance(store, dict):
            return store[name](*args)
        return getattr(store, name)(*args)

    class _Meta:
        async def get(self, key: str) -> str | None:
            return _call(meta, "get", key)

        async def get_many(self, keys: list[str]) -> dict[str, str | None]:
            return _call(meta, "get_many", keys)

        async def set(self, key: str, value: str) -> None:
            _call(meta, "set", key, value)

        async def set_many(self, entries: dict[str, str]) -> None:
            _call(meta, "set_many", entries)

        async def replace_header_if(self, *args: object) -> None:
            _call(meta, "replace_header_if", *args)

        async def replace_period_if(self, *args: object) -> None:
            _call(meta, "replace_period_if", *args)

    class _Azure:
        async def replace_snapshot(self, input: object) -> None:
            fn = azure["replace_snapshot"] if isinstance(azure, dict) else azure.replace_snapshot  # type: ignore[union-attr]
            return fn(input)

        async def list_execucoes(self, plan_key: str):
            fn = azure["list_execucoes"] if isinstance(azure, dict) else azure.list_execucoes  # type: ignore[union-attr]
            return fn(plan_key)

        async def list_falhas(self, plan_key: str):
            fn = azure["list_falhas"] if isinstance(azure, dict) else azure.list_falhas  # type: ignore[union-attr]
            return fn(plan_key)

        async def query_execucoes(self, params: object):
            fn = azure["query_execucoes"] if isinstance(azure, dict) else azure.query_execucoes  # type: ignore[union-attr]
            return fn(params)

        async def query_falhas(self, params: object):
            fn = azure["query_falhas"] if isinstance(azure, dict) else azure.query_falhas  # type: ignore[union-attr]
            return fn(params)

    class _Legacy:
        async def list_base(self):
            return _call(legacy, "list_base")

    class _Planning:
        async def latest_revision(self, plan_key: str):
            return _call(planning, "latest_revision", plan_key)

        async def revision_by_version(self, plan_key: str, version: int):
            return _call(planning, "revision_by_version", plan_key, version)

        async def list_revisions(self, plan_key: str):
            return _call(planning, "list_revisions", plan_key)

        async def load_scope(self, revision_id: int):
            return _call(planning, "load_scope", revision_id)

        async def load_schedule(self, revision_id: int):
            return _call(planning, "load_schedule", revision_id)

        async def commit_revision(self, input: object) -> int:
            return _call(planning, "commit_revision", input)

        async def save_cell(self, input: object) -> None:
            _call(planning, "save_cell", input)

        async def save_cells(self, inputs: list[object]) -> None:
            _call(planning, "save_cells", inputs)

        async def append_change_log(self, input: object) -> None:
            _call(planning, "append_change_log", input)

        async def list_change_log(self, plan_key: str, limit: int = 300):
            return _call(planning, "list_change_log", plan_key, limit)

        async def change_log_supported(self) -> bool:
            return _call(planning, "change_log_supported")

    return {
        "meta": _Meta(),  # type: ignore[typeddict-item]
        "azure_snapshot": _Azure(),  # type: ignore[typeddict-item]
        "legacy_plan": _Legacy(),  # type: ignore[typeddict-item]
        "planning": _Planning(),  # type: ignore[typeddict-item]
    }


def _sqlite_stores() -> PersistenceStores:
    from fourqa.db import sqlite_azure_snapshot_store, sqlite_legacy_plan_store, sqlite_meta_store, sqlite_planning_store

    raw: PersistenceStores = {
        "meta": sqlite_meta_store.sqlite_meta_store,  # type: ignore[typeddict-item]
        "azure_snapshot": sqlite_azure_snapshot_store.sqlite_azure_snapshot_store,  # type: ignore[typeddict-item]
        "legacy_plan": sqlite_legacy_plan_store.sqlite_legacy_plan_store,  # type: ignore[typeddict-item]
        "planning": sqlite_planning_store.sqlite_planning_store,  # type: ignore[typeddict-item]
    }
    return _wrap_sync_stores(raw)


def _wrap_async_stores(raw: PersistenceStores) -> PersistenceStores:
    meta = raw["meta"]
    azure = raw["azure_snapshot"]
    legacy = raw["legacy_plan"]
    planning = raw["planning"]

    class _Meta:
        async def get(self, key: str) -> str | None:
            return await meta.get(key)  # type: ignore[union-attr]

        async def get_many(self, keys: list[str]) -> dict[str, str | None]:
            return await meta.get_many(keys)  # type: ignore[union-attr]

        async def set(self, key: str, value: str) -> None:
            await meta.set(key, value)  # type: ignore[union-attr]

        async def set_many(self, entries: dict[str, str]) -> None:
            await meta.set_many(entries)  # type: ignore[union-attr]

        async def replace_header_if(self, *args: object) -> None:
            await meta.replace_header_if(*args)  # type: ignore[union-attr]

        async def replace_period_if(self, *args: object) -> None:
            await meta.replace_period_if(*args)  # type: ignore[union-attr]

    class _Azure:
        async def replace_snapshot(self, input: object) -> None:
            await azure.replace_snapshot(input)  # type: ignore[union-attr]

        async def list_execucoes(self, plan_key: str):
            return await azure.list_execucoes(plan_key)  # type: ignore[union-attr]

        async def list_falhas(self, plan_key: str):
            return await azure.list_falhas(plan_key)  # type: ignore[union-attr]

        async def query_execucoes(self, params: object):
            return await azure.query_execucoes(params)  # type: ignore[union-attr]

        async def query_falhas(self, params: object):
            return await azure.query_falhas(params)  # type: ignore[union-attr]

    class _Legacy:
        async def list_base(self):
            return await legacy.list_base()  # type: ignore[union-attr]

    class _Planning:
        async def latest_revision(self, plan_key: str):
            return await planning.latest_revision(plan_key)  # type: ignore[union-attr]

        async def revision_by_version(self, plan_key: str, version: int):
            return await planning.revision_by_version(plan_key, version)  # type: ignore[union-attr]

        async def list_revisions(self, plan_key: str):
            return await planning.list_revisions(plan_key)  # type: ignore[union-attr]

        async def load_scope(self, revision_id: int):
            return await planning.load_scope(revision_id)  # type: ignore[union-attr]

        async def load_schedule(self, revision_id: int):
            return await planning.load_schedule(revision_id)  # type: ignore[union-attr]

        async def commit_revision(self, input: object) -> int:
            return await planning.commit_revision(input)  # type: ignore[union-attr]

        async def save_cell(self, input: object) -> None:
            await planning.save_cell(input)  # type: ignore[union-attr]

        async def save_cells(self, inputs: list[object]) -> None:
            await planning.save_cells(inputs)  # type: ignore[union-attr]

        async def append_change_log(self, input: object) -> None:
            await planning.append_change_log(input)  # type: ignore[union-attr]

        async def list_change_log(self, plan_key: str, limit: int = 300):
            return await planning.list_change_log(plan_key, limit)  # type: ignore[union-attr]

        async def change_log_supported(self) -> bool:
            return await planning.change_log_supported()  # type: ignore[union-attr]

    return {
        "meta": _Meta(),  # type: ignore[typeddict-item]
        "azure_snapshot": _Azure(),  # type: ignore[typeddict-item]
        "legacy_plan": _Legacy(),  # type: ignore[typeddict-item]
        "planning": _Planning(),  # type: ignore[typeddict-item]
    }


async def _postgres_stores() -> PersistenceStores:
    try:
        url = env_value("DATABASE_URL")
    except Exception as err:
        raise PersistenceProviderError(public_db_error(err)) from err
    if not url:
        raise PersistenceProviderError("DATABASE_URL is required when DB_PROVIDER=postgres")
    from fourqa.db.postgres import migrate as pg_migrate
    from fourqa.db.postgres import (
        postgres_azure_snapshot_store,
        postgres_legacy_plan_store,
        postgres_meta_store,
        postgres_planning_store,
    )

    await pg_migrate.assert_postgres_schema()
    raw: PersistenceStores = {
        "meta": postgres_meta_store,  # type: ignore[typeddict-item]
        "azure_snapshot": postgres_azure_snapshot_store,  # type: ignore[typeddict-item]
        "legacy_plan": postgres_legacy_plan_store,  # type: ignore[typeddict-item]
        "planning": postgres_planning_store,  # type: ignore[typeddict-item]
    }
    return _wrap_async_stores(raw)


async def get_stores() -> PersistenceStores:
    global _cached
    from fourqa.azure.azure_cache_read_source import apply_experimental_azure_cache_read, is_azure_cache_read_enabled

    provider = resolve_db_provider(env_value("DB_PROVIDER"))
    read_cache = is_azure_cache_read_enabled()
    if (
        _cached
        and _cached.get("provider") == provider
        and _cached.get("read_cache") == read_cache
    ):
        return _cached["stores"]  # type: ignore[return-value]
    base = _sqlite_stores() if provider == "sqlite" else await _postgres_stores()
    stores = apply_experimental_azure_cache_read(base)
    _cached = {"provider": provider, "read_cache": read_cache, "stores": stores, "durable_snapshot": base["azure_snapshot"]}
    return stores


async def get_durable_azure_snapshot() -> AzureSnapshotStore:
    await get_stores()
    if not _cached:
        raise PersistenceProviderError("stores indisponíveis")
    return _cached["durable_snapshot"]  # type: ignore[return-value]


async def persistence_ready() -> bool:
    provider = resolve_db_provider(env_value("DB_PROVIDER"))
    if provider == "sqlite":
        from fourqa.db.db import db_ready

        return db_ready()
    try:
        await get_stores()
        from fourqa.db.postgres.pool import get_pool

        async with get_pool().connection() as conn:
            await conn.execute("SELECT 1")
        return True
    except Exception:
        return False
