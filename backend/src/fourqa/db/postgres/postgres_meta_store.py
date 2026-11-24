"""PostgreSQL meta store."""

from __future__ import annotations

from fourqa.db.postgres.pool import get_pool
from fourqa.persistence.meta_scope import scoped_meta_key
from fourqa.persistence.planning_conflict import PlanningConflictError

UPSERT_META = """
INSERT INTO workbook_meta (key, value) VALUES (%s, %s)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
"""


def _cell(row: object, column: str, index: int) -> str | None:
    value = row.get(column) if isinstance(row, dict) else row[index]  # type: ignore[index]
    return None if value is None else str(value)


async def get(key: str) -> str | None:
    pool = get_pool()
    if pool.closed:
        await pool.open()
    async with pool.connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute("SELECT value FROM workbook_meta WHERE key = %s", (scoped_meta_key(key),))
            row = await cur.fetchone()
            if not row:
                return None
            value = _cell(row, "value", 0)
            return str(value) if value is not None else None


async def get_many(keys: list[str]) -> dict[str, str | None]:
    unique = list(dict.fromkeys(keys))
    out: dict[str, str | None] = {key: None for key in unique}
    if not unique:
        return out
    stored_to_key = {scoped_meta_key(key): key for key in unique}
    pool = get_pool()
    if pool.closed:
        await pool.open()
    async with pool.connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute("SELECT key, value FROM workbook_meta WHERE key = ANY(%s)", (list(stored_to_key),))
            rows = await cur.fetchall()
            for row in rows:
                if isinstance(row, dict):
                    stored, value = row.get("key"), row.get("value")
                else:
                    stored, value = row[0], row[1]
                key = stored_to_key.get(str(stored)) if stored is not None else None
                if key is None:
                    continue
                out[key] = str(value) if value is not None else None
    return out


async def set(key: str, value: str) -> None:
    pool = get_pool()
    if pool.closed:
        await pool.open()
    async with pool.connection() as conn:
        await conn.execute(UPSERT_META, (scoped_meta_key(key), value))
        await conn.commit()


async def set_many(entries: dict[str, str]) -> None:
    pool = get_pool()
    if pool.closed:
        await pool.open()
    async with pool.connection() as conn:
        async with conn.transaction():
            for key, value in entries.items():
                await conn.execute(UPSERT_META, (scoped_meta_key(key), value))


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
    k_title, k_legacy, k_subtitle = (scoped_meta_key(k) for k in ("cabecalho_titulo", "title", "cabecalho_subtitulo"))
    pool = get_pool()
    if pool.closed:
        await pool.open()
    async with pool.connection() as conn:
        async with conn.transaction():
            for key in sorted([k_subtitle, k_title, k_legacy]):
                await _lock_meta_key(conn, key)
            async with conn.cursor() as cur:
                await cur.execute("SELECT value FROM workbook_meta WHERE key = %s", (k_title,))
                t1 = await cur.fetchone()
                await cur.execute("SELECT value FROM workbook_meta WHERE key = %s", (k_legacy,))
                t2 = await cur.fetchone()
                await cur.execute("SELECT value FROM workbook_meta WHERE key = %s", (k_subtitle,))
                t3 = await cur.fetchone()
            title_saved = _cell(t1, "value", 0) if t1 else None
            title_legacy = _cell(t2, "value", 0) if t2 else None
            subtitle_saved = _cell(t3, "value", 0) if t3 else None
            effective_title = (title_saved or title_legacy or default_title).strip()
            effective_subtitle = (subtitle_saved or default_subtitle).strip()
            if effective_title != expected_title.strip() or effective_subtitle != expected_subtitle.strip():
                raise PlanningConflictError(PlanningConflictError.header_changed)
            await conn.execute(UPSERT_META, (k_title, title.strip()))
            await conn.execute(UPSERT_META, (k_subtitle, subtitle.strip()))


async def replace_period_if(expected_inicio: str, expected_fim: str, inicio: str, fim: str) -> None:
    k_inicio, k_fim = scoped_meta_key("data_inicio"), scoped_meta_key("data_fim")
    pool = get_pool()
    if pool.closed:
        await pool.open()
    async with pool.connection() as conn:
        async with conn.transaction():
            for key in sorted([k_fim, k_inicio]):
                await _lock_meta_key(conn, key)
            async with conn.cursor() as cur:
                await cur.execute("SELECT value FROM workbook_meta WHERE key = %s", (k_inicio,))
                a = await cur.fetchone()
                await cur.execute("SELECT value FROM workbook_meta WHERE key = %s", (k_fim,))
                b = await cur.fetchone()
            current_inicio = str(_cell(a, "value", 0) or "") if a else ""
            current_fim = str(_cell(b, "value", 0) or "") if b else ""
            if current_inicio != expected_inicio or current_fim != expected_fim:
                raise PlanningConflictError(PlanningConflictError.period_changed)
            await conn.execute(UPSERT_META, (k_inicio, inicio))
            await conn.execute(UPSERT_META, (k_fim, fim))
