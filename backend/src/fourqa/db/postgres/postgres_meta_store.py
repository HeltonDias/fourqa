"""PostgreSQL meta store (mirrors backend/src/db/postgres/postgresMetaStore.ts)."""

from __future__ import annotations

from fourqa.db.postgres.pool import get_pool
from fourqa.persistence.planning_conflict import PlanningConflictError

UPSERT_META = """
INSERT INTO workbook_meta (key, value) VALUES (%s, %s)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
"""


def _cell(row: object, column: str, index: int) -> object:
    if isinstance(row, dict):
        return row.get(column)
    return row[index]  # type: ignore[index]


async def get(key: str) -> str | None:
    pool = get_pool()
    if pool.closed:
        await pool.open()
    async with pool.connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute("SELECT value FROM workbook_meta WHERE key = %s", (key,))
            row = await cur.fetchone()
            if not row:
                return None
            value = _cell(row, "value", 0)
            return str(value) if value is not None else None


async def get_many(keys: list[str]) -> dict[str, str | None]:
    unique = list(dict.fromkeys(keys))
    out = {key: None for key in unique}
    if not unique:
        return out
    pool = get_pool()
    if pool.closed:
        await pool.open()
    async with pool.connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute("SELECT key, value FROM workbook_meta WHERE key = ANY(%s)", (unique,))
            rows = await cur.fetchall()
            for row in rows:
                if isinstance(row, dict):
                    key, value = row.get("key"), row.get("value")
                else:
                    key, value = row[0], row[1]
                if key is None or str(key) not in out:
                    continue
                out[str(key)] = str(value) if value is not None else None
    return out


async def set(key: str, value: str) -> None:
    pool = get_pool()
    if pool.closed:
        await pool.open()
    async with pool.connection() as conn:
        await conn.execute(UPSERT_META, (key, value))
        await conn.commit()


async def set_many(entries: dict[str, str]) -> None:
    pool = get_pool()
    if pool.closed:
        await pool.open()
    async with pool.connection() as conn:
        async with conn.transaction():
            for key, value in entries.items():
                await conn.execute(UPSERT_META, (key, value))


async def _lock_meta_key(conn, key: str) -> None:
    await conn.execute("SELECT pg_advisory_xact_lock(hashtext(%s))", (f"fourqa-meta:{key}",))


async def replace_header_if(
    expected_title: str,
    expected_subtitle: str,
    title: str,
    subtitle: str,
    default_title: str,
    default_subtitle: str,
) -> None:
    pool = get_pool()
    if pool.closed:
        await pool.open()
    async with pool.connection() as conn:
        async with conn.transaction():
            for key in sorted(["cabecalho_subtitulo", "cabecalho_titulo", "title"]):
                await _lock_meta_key(conn, key)
            async with conn.cursor() as cur:
                await cur.execute("SELECT value FROM workbook_meta WHERE key = %s", ("cabecalho_titulo",))
                t1 = await cur.fetchone()
                await cur.execute("SELECT value FROM workbook_meta WHERE key = %s", ("title",))
                t2 = await cur.fetchone()
                await cur.execute("SELECT value FROM workbook_meta WHERE key = %s", ("cabecalho_subtitulo",))
                t3 = await cur.fetchone()
            title_saved = _cell(t1, "value", 0) if t1 else None
            title_legacy = _cell(t2, "value", 0) if t2 else None
            subtitle_saved = _cell(t3, "value", 0) if t3 else None
            effective_title = (title_saved or title_legacy or default_title).strip()
            effective_subtitle = (subtitle_saved or default_subtitle).strip()
            if effective_title != expected_title.strip() or effective_subtitle != expected_subtitle.strip():
                raise PlanningConflictError(PlanningConflictError.header_changed)
            await conn.execute(UPSERT_META, ("cabecalho_titulo", title.strip()))
            await conn.execute(UPSERT_META, ("cabecalho_subtitulo", subtitle.strip()))


async def replace_period_if(expected_inicio: str, expected_fim: str, inicio: str, fim: str) -> None:
    pool = get_pool()
    if pool.closed:
        await pool.open()
    async with pool.connection() as conn:
        async with conn.transaction():
            for key in sorted(["data_fim", "data_inicio"]):
                await _lock_meta_key(conn, key)
            async with conn.cursor() as cur:
                await cur.execute("SELECT value FROM workbook_meta WHERE key = %s", ("data_inicio",))
                a = await cur.fetchone()
                await cur.execute("SELECT value FROM workbook_meta WHERE key = %s", ("data_fim",))
                b = await cur.fetchone()
            current_inicio = str(_cell(a, "value", 0) or "") if a else ""
            current_fim = str(_cell(b, "value", 0) or "") if b else ""
            if current_inicio != expected_inicio or current_fim != expected_fim:
                raise PlanningConflictError(PlanningConflictError.period_changed)
            await conn.execute(UPSERT_META, ("data_inicio", inicio))
            await conn.execute(UPSERT_META, ("data_fim", fim))
