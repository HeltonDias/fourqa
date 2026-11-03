"""PostgreSQL pool."""

from __future__ import annotations

import os
import re
from contextlib import asynccontextmanager
from functools import lru_cache
from pathlib import Path
from typing import Any, AsyncIterator, Callable, LiteralString, TypeVar, cast
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

from psycopg import AsyncConnection, AsyncCursor
from psycopg.rows import DictRow, dict_row
from psycopg_pool import AsyncConnectionPool

from fourqa.azure.config import env_value

_ssl_query_keys = frozenset({"sslmode", "ssl", "uselibpqcompat", "sslrootcert", "sslcert", "sslkey"})
_placeholder = re.compile(r"\$(\d+)")

PgConnection = AsyncConnection[DictRow]


def trusted_sql(text: str) -> LiteralString:
    """Somente SQL escrito no repositório (constantes, migrations, nomes de coluna fixos); nunca entrada do usuário."""
    return cast(LiteralString, text)


def adapt_placeholders(sql: str, params: Any) -> tuple[str, Any]:
    """Traduz `$1` do Node para `%s` do psycopg, na ordem em que aparecem."""
    if not isinstance(sql, str) or _placeholder.search(sql) is None:
        return sql, params
    values = list(params) if isinstance(params, (list, tuple)) else ([] if params is None else [params])
    ordered: list[Any] = []

    def repl(match: re.Match[str]) -> str:
        ordered.append(values[int(match.group(1)) - 1])
        return "%s"

    return _placeholder.sub(repl, sql), ordered


_cursor_execute = AsyncCursor.execute


async def _execute_adapted(self: AsyncCursor, query: str, params: Any = None, **kwargs: Any):
    query, params = adapt_placeholders(query, params)
    return await _cursor_execute(self, trusted_sql(query), params, **kwargs)


AsyncCursor.execute = _execute_adapted  # type: ignore[method-assign]
_repo_root = Path(__file__).resolve().parents[5]
_test_pool: Any | None = None
T = TypeVar("T")


def database_url() -> str:
    url = env_value("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL is required when DB_PROVIDER=postgres")
    return url


def _strip_ssl_params(connection_string: str) -> str:
    parsed = urlparse(connection_string)
    if not parsed.query:
        return connection_string
    params = [(k, v) for k, v in parse_qsl(parsed.query, keep_blank_values=True) if k.lower() not in _ssl_query_keys]
    return urlunparse(parsed._replace(query=urlencode(params)))


def _ssl_config(host: str, mode: str, ssl_flag: str, ca_pem: str | None) -> bool | dict[str, Any]:
    ca = {"ca": ca_pem} if ca_pem else {}
    if mode == "disable" or ssl_flag in ("0", "false"):
        return False
    if mode == "no-verify" or ssl_flag == "no-verify":
        return {"sslmode": "require", **ca}
    verifies = mode in ("require", "verify-ca", "verify-full", "prefer", "allow") or ssl_flag in ("1", "true")
    if mode and not verifies:
        raise RuntimeError("sslmode da DATABASE_URL não é suportado")
    if ssl_flag and not verifies:
        raise RuntimeError("parâmetro ssl da DATABASE_URL não é suportado")
    host_l = host.lower()
    if verifies or host_l.endswith(".supabase.co") or host_l.endswith(".supabase.com") or host_l.endswith(".pooler.supabase.com"):
        return {"sslmode": "require", **ca}
    return False


def read_postgres_ca_pem(file: str) -> str:
    trimmed = file.strip()
    resolved = Path(trimmed) if Path(trimmed).is_absolute() else _repo_root / trimmed
    pem = resolved.read_text(encoding="utf-8")
    if "BEGIN CERTIFICATE" not in pem:
        raise RuntimeError("Certificado CA do PostgreSQL não está em PEM")
    return pem


def postgres_ca_file(connection_string: str) -> str | None:
    """Caminho de arquivo para o libpq (`sslrootcert`). PEM inline vira arquivo temporário."""
    inline = env_value("DATABASE_SSL_CA")
    if inline:
        if "BEGIN CERTIFICATE" not in inline:
            raise RuntimeError("Certificado CA do PostgreSQL não está em PEM")
        target = _repo_root / "data" / ".pg-ca.pem"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(inline, encoding="utf-8")
        return str(target)
    configured = env_value("DATABASE_SSL_CA_FILE")
    if configured:
        trimmed = configured.strip()
        resolved = Path(trimmed) if Path(trimmed).is_absolute() else _repo_root / trimmed
        if not resolved.is_file():
            raise FileNotFoundError(resolved)
        return str(resolved)
    parsed = urlparse(connection_string)
    for key, value in parse_qsl(parsed.query):
        if key.lower() == "sslrootcert" and value.strip():
            trimmed = value.strip()
            resolved = Path(trimmed) if Path(trimmed).is_absolute() else _repo_root / trimmed
            if not resolved.is_file():
                raise FileNotFoundError(resolved)
            return str(resolved)
    return None


def bind_postgres_test_pool(next_pool: Any | None) -> None:
    global _test_pool
    _test_pool = next_pool


@lru_cache(maxsize=1)
def get_pool() -> AsyncConnectionPool[PgConnection]:
    if _test_pool is not None:
        return cast(AsyncConnectionPool[PgConnection], _test_pool)
    url = _strip_ssl_params(database_url())
    parsed = urlparse(url)
    if not parsed.hostname:
        raise RuntimeError("DATABASE_URL inválida")
    params = dict(parse_qsl(parsed.query))
    mode = str(params.get("sslmode", "")).lower()
    ssl_flag = str(params.get("ssl", "")).lower()
    ca_file = postgres_ca_file(url)
    ssl = _ssl_config(parsed.hostname, mode, ssl_flag, ca_file)
    max_size = 1 if os.environ.get("VERCEL") == "1" else 10
    kwargs: dict[str, Any] = {
        "conninfo": url,
        "max_size": max_size,
        "timeout": 10,
        "reconnect_timeout": 5,
        "kwargs": {"row_factory": dict_row},
    }
    if ssl is not False:
        kwargs["kwargs"]["sslmode"] = "require"
        if isinstance(ssl, dict) and ssl.get("ca"):
            kwargs["kwargs"]["sslrootcert"] = ssl["ca"]
    return AsyncConnectionPool(open=False, connection_class=PgConnection, **kwargs)


async def query(sql: str, params: list[Any] | None = None) -> list[dict[str, Any]]:
    pool = get_pool()
    if pool.closed:
        await pool.open()
    async with pool.connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute(trusted_sql(sql), params or [])
            rows = await cur.fetchall()
            return list(rows)


async def with_transaction(fn: Callable[[PgConnection], Any], lock_sql: str | None = None) -> Any:
    pool = get_pool()
    if pool.closed:
        await pool.open()
    async with pool.connection() as conn:
        async with conn.transaction():
            if lock_sql:
                await conn.execute(trusted_sql(lock_sql))
            return await fn(conn)


def bind(value: Any) -> Any:
    return None if value is None else value


def as_number(value: Any) -> int | float:
    if isinstance(value, (int, float)) and float(value) == float(value):
        return value
    if isinstance(value, str) and value.strip():
        parsed = float(value)
        if parsed == parsed:
            return int(parsed) if parsed.is_integer() else parsed
    raise ValueError("Valor numérico inválido vindo do PostgreSQL")


def as_number_or_null(value: Any) -> int | float | None:
    if value is None:
        return None
    return as_number(value)


def as_int_or_null(value: Any) -> int | None:
    number = as_number_or_null(value)
    return None if number is None else int(number)


def as_text(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        return value
    return str(value)


def as_flag(value: Any) -> int:
    if value is True:
        return 1
    if value is False:
        return 0
    return int(as_number(value))
