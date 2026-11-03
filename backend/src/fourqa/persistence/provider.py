"""Persistence provider."""

from __future__ import annotations

import inspect
import re
from collections.abc import Awaitable, Callable
from typing import Any, Literal, cast

from fourqa.azure.config import env_value
from fourqa.persistence.contracts import AzureSnapshotStore, PersistenceStores

ProviderName = Literal["sqlite", "postgres"]

_cached: dict[str, Any] | None = None


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


class _StoreProxy:
    """Expõe um store síncrono (dict de funções) ou assíncrono (módulo) pelo contrato assíncrono."""

    def __init__(self, store: Any) -> None:
        self._store = store

    def __getattr__(self, name: str) -> Callable[..., Awaitable[Any]]:
        store = self._store
        if isinstance(store, dict):
            if name not in store:
                raise AttributeError(name)
            target = store[name]
        else:
            target = getattr(store, name)

        async def call(*args: Any, **kwargs: Any) -> Any:
            result = target(*args, **kwargs)
            if inspect.isawaitable(result):
                return await result
            return result

        return call


def _wrap_stores(raw: dict[str, Any]) -> PersistenceStores:
    return cast(
        PersistenceStores,
        {
            "meta": _StoreProxy(raw["meta"]),
            "azure_snapshot": _StoreProxy(raw["azure_snapshot"]),
            "legacy_plan": _StoreProxy(raw["legacy_plan"]),
            "planning": _StoreProxy(raw["planning"]),
        },
    )


def _sqlite_stores() -> PersistenceStores:
    from fourqa.db import sqlite_azure_snapshot_store, sqlite_legacy_plan_store, sqlite_meta_store, sqlite_planning_store

    return _wrap_stores(
        {
            "meta": sqlite_meta_store.sqlite_meta_store,
            "azure_snapshot": sqlite_azure_snapshot_store.sqlite_azure_snapshot_store,
            "legacy_plan": sqlite_legacy_plan_store.sqlite_legacy_plan_store,
            "planning": sqlite_planning_store.sqlite_planning_store,
        }
    )


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
    return _wrap_stores(
        {
            "meta": postgres_meta_store,
            "azure_snapshot": postgres_azure_snapshot_store,
            "legacy_plan": postgres_legacy_plan_store,
            "planning": postgres_planning_store,
        }
    )


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
        return cast(PersistenceStores, _cached["stores"])
    base = _sqlite_stores() if provider == "sqlite" else await _postgres_stores()
    stores = apply_experimental_azure_cache_read(base)
    _cached = {"provider": provider, "read_cache": read_cache, "stores": stores, "durable_snapshot": base["azure_snapshot"]}
    return stores


async def get_identity_store() -> Any:
    """Usuários, PATs, conexões e membros. Garante o schema antes do primeiro uso."""
    provider = resolve_db_provider(env_value("DB_PROVIDER"))
    if provider == "sqlite":
        from fourqa.db.sqlite_identity_store import sqlite_identity_store

        return _StoreProxy(sqlite_identity_store)
    await get_stores()
    from fourqa.db.postgres import postgres_identity_store

    return _StoreProxy(postgres_identity_store)


async def get_durable_azure_snapshot() -> AzureSnapshotStore:
    await get_stores()
    if not _cached:
        raise PersistenceProviderError("stores indisponíveis")
    return cast(AzureSnapshotStore, _cached["durable_snapshot"])


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
