"""Postgres schema migrations."""

from __future__ import annotations

from pathlib import Path

from fourqa.db.postgres.pool import get_pool, trusted_sql

_MIGRATIONS_DIR = Path(__file__).resolve().parents[3] / "db" / "postgres" / "migrations"
PLANNING_CHANGE_LOG_VERSION = 4


async def assert_postgres_schema() -> None:
    pool = get_pool()
    if pool.closed:
        await pool.open()
    async with pool.connection() as conn:
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS schema_migrations (
              version INTEGER PRIMARY KEY,
              applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
            """
        )
        for path in sorted(_MIGRATIONS_DIR.glob("*.sql")):
            version = int(path.stem.split("_", 1)[0])
            cur = await conn.execute("SELECT 1 FROM schema_migrations WHERE version = %s", (version,))
            if await cur.fetchone():
                continue
            await conn.execute(trusted_sql(path.read_text(encoding="utf-8")))
            await conn.execute("INSERT INTO schema_migrations (version) VALUES (%s)", (version,))
        await conn.commit()
