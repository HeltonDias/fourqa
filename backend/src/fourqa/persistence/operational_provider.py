"""Provider operacional."""

import os

from fourqa.azure.config import env_value


def local_sqlite_allowed() -> bool:
    """Exceção de desenvolvimento à DEC-T01: nunca vale na Vercel."""
    return env_value("FOURQA_LOCAL_SQLITE") == "1" and os.environ.get("VERCEL") != "1"


def assert_operational_provider(value: str) -> None:
    provider = value.strip().lower()
    if provider == "postgres":
        return
    if provider == "sqlite" and local_sqlite_allowed():
        return
    raise RuntimeError(
        "A API exige DB_PROVIDER=postgres. SQLite fica restrito aos testes, ao backup e ao dev local com FOURQA_LOCAL_SQLITE=1."
    )
