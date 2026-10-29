"""Experimental Azure cache read (mirrors azureCacheReadSource.ts)."""

from __future__ import annotations

import os
from typing import Any

from fourqa.azure.azure_cache_query import EXEC_SEARCH, FALHA_SEARCH, list_cached_rows, page_cached_rows
from fourqa.azure.config import env_value
from fourqa.azure.in_memory_azure_cache import InMemoryAzureCache, get_in_memory_azure_cache
from fourqa.azure.plan_key_match import plan_key_match
from fourqa.persistence.contracts import PersistenceStores
from fourqa.persistence.plan_key import required_plan_key


class AzureCacheUnavailableError(Exception):
    def __init__(self) -> None:
        super().__init__("Dados do Azure ainda não foram carregados. Use Atualizar.")
        self.name = "AzureCacheUnavailableError"


def is_azure_cache_read_enabled() -> bool:
    flag = env_value("AZURE_CACHE_READ")
    if os.environ.get("VERCEL") == "1":
        return flag == "1"
    if flag == "1":
        return True
    if flag == "0":
        return False
    return env_value("DB_PROVIDER").strip().lower() == "postgres"


def assert_vercel_cache_mode() -> None:
    if os.environ.get("VERCEL") == "1" and env_value("AZURE_CACHE_READ") == "1":
        raise RuntimeError(
            "AZURE_CACHE_READ=1 não é permitido na Vercel. O snapshot operacional fica no PostgreSQL."
        )


_BATCH_EXACT = {"kpi_plan_key", "ultima_sincronizacao_azure"}
_BATCH_PREFIX = ("dimensoes_catalog:", "kpi_impactos:")


def _is_batch_meta_key(key: str) -> bool:
    return key in _BATCH_EXACT or any(key.startswith(p) for p in _BATCH_PREFIX)


def read_batch_meta(meta: dict[str, str], key: str) -> str | None:
    if key in meta:
        return meta[key]
    for prefix in _BATCH_PREFIX:
        if not key.startswith(prefix):
            continue
        want = key[len(prefix) :]
        for stored, value in meta.items():
            if stored.startswith(prefix) and plan_key_match(stored[len(prefix) :], want):
                return value
        return None
    return None


def _published_rows(cache: InMemoryAzureCache, plan_key: str, pick: str) -> list[dict[str, Any]]:
    if not cache.has_published_generation():
        raise AzureCacheUnavailableError()
    view = cache.get_plan(plan_key)
    if view["state"] == "empty":
        return []
    return [dict(r) for r in view[pick]]


def _wrap_azure(cache: InMemoryAzureCache, snapshot: Any) -> Any:
    class Azure:
        async def replace_snapshot(self, _input: object) -> None:
            raise RuntimeError("Persistência de snapshot desligada no modo cache.")

        async def list_execucoes(self, plan_key: str):
            if not cache.has_published_generation():
                return await snapshot.list_execucoes(plan_key)
            return list_cached_rows(_published_rows(cache, plan_key, "execucoes"))

        async def list_falhas(self, plan_key: str):
            if not cache.has_published_generation():
                return await snapshot.list_falhas(plan_key)
            return list_cached_rows(_published_rows(cache, plan_key, "falhas"))

        async def query_execucoes(self, params: dict[str, Any]):
            plan_key = required_plan_key(params.get("plan_key"))
            if not cache.has_published_generation():
                return await snapshot.query_execucoes({**params, "plan_key": plan_key})
            return page_cached_rows(_published_rows(cache, plan_key, "execucoes"), EXEC_SEARCH, {**params, "plan_key": plan_key})

        async def query_falhas(self, params: dict[str, Any]):
            plan_key = required_plan_key(params.get("plan_key"))
            if not cache.has_published_generation():
                return await snapshot.query_falhas({**params, "plan_key": plan_key})
            return page_cached_rows(_published_rows(cache, plan_key, "falhas"), FALHA_SEARCH, {**params, "plan_key": plan_key})

    return Azure()


def _wrap_meta(cache: InMemoryAzureCache, meta: Any) -> Any:
    class Meta:
        async def get(self, key: str) -> str | None:
            if not _is_batch_meta_key(key):
                return await meta.get(key)
            generation = cache.read_generation()
            if not generation:
                return await meta.get(key)
            return read_batch_meta(generation["meta"], key)

        async def get_many(self, keys: list[str]) -> dict[str, str | None]:
            unique = list(dict.fromkeys(keys))
            generation = cache.read_generation()
            out: dict[str, str | None] = {k: None for k in unique}
            sql_keys: list[str] = []
            for key in unique:
                if generation and _is_batch_meta_key(key):
                    out[key] = read_batch_meta(generation["meta"], key)
                else:
                    sql_keys.append(key)
            if sql_keys:
                from_sql = await meta.get_many(sql_keys)
                for key in sql_keys:
                    out[key] = from_sql.get(key)
            return out

        async def set(self, key: str, value: str) -> None:
            await meta.set(key, value)

        async def set_many(self, entries: dict[str, str]) -> None:
            await meta.set_many(entries)

        async def replace_header_if(self, *args: object) -> None:
            await meta.replace_header_if(*args)

        async def replace_period_if(self, *args: object) -> None:
            await meta.replace_period_if(*args)

    return Meta()


def apply_experimental_azure_cache_read(
    stores: PersistenceStores,
    cache: InMemoryAzureCache | None = None,
) -> PersistenceStores:
    if not is_azure_cache_read_enabled():
        return stores
    cache = cache or get_in_memory_azure_cache()
    return {
        **stores,
        "meta": _wrap_meta(cache, stores["meta"]),  # type: ignore[typeddict-item]
        "azure_snapshot": _wrap_azure(cache, stores["azure_snapshot"]),  # type: ignore[typeddict-item]
    }
