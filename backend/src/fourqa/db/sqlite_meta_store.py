"""SQLite meta store (mirrors backend/src/db/sqliteMetaStore.ts)."""

from __future__ import annotations

from fourqa.db.db import get_db
from fourqa.persistence.planning_conflict import PlanningConflictError


def get(key: str) -> str | None:
    row = get_db().execute("SELECT value FROM workbook_meta WHERE key = ?", (key,)).fetchone()
    return str(row[0]) if row else None


def get_many(keys: list[str]) -> dict[str, str | None]:
    unique = list(dict.fromkeys(keys))
    out = {key: None for key in unique}
    if not unique:
        return out
    placeholders = ", ".join("?" for _ in unique)
    rows = get_db().execute(
        f"SELECT key, value FROM workbook_meta WHERE key IN ({placeholders})", unique
    ).fetchall()
    for row in rows:
        out[str(row[0])] = str(row[1]) if row[1] is not None else None
    return out


def set(key: str, value: str) -> None:
    get_db().execute("INSERT OR REPLACE INTO workbook_meta (key, value) VALUES (?, ?)", (key, value))
    get_db().commit()


def set_many(entries: dict[str, str]) -> None:
    db = get_db()
    db.execute("BEGIN")
    try:
        for key, value in entries.items():
            db.execute("INSERT OR REPLACE INTO workbook_meta (key, value) VALUES (?, ?)", (key, value))
        db.commit()
    except Exception:
        db.rollback()
        raise


def replace_header_if(
    expected_title: str,
    expected_subtitle: str,
    title: str,
    subtitle: str,
    default_title: str,
    default_subtitle: str,
) -> None:
    effective_title = (get("cabecalho_titulo") or get("title") or default_title).strip()
    effective_subtitle = (get("cabecalho_subtitulo") or default_subtitle).strip()
    if effective_title != expected_title.strip() or effective_subtitle != expected_subtitle.strip():
        raise PlanningConflictError(PlanningConflictError.header_changed)
    set_many({"cabecalho_titulo": title.strip(), "cabecalho_subtitulo": subtitle.strip()})


def replace_period_if(expected_inicio: str, expected_fim: str, inicio: str, fim: str) -> None:
    current_inicio = get("data_inicio") or ""
    current_fim = get("data_fim") or ""
    if current_inicio != expected_inicio or current_fim != expected_fim:
        raise PlanningConflictError(PlanningConflictError.period_changed)
    set_many({"data_inicio": inicio, "data_fim": fim})


sqlite_meta_store = {
    "get": get,
    "get_many": get_many,
    "set": set,
    "set_many": set_many,
    "replace_header_if": replace_header_if,
    "replace_period_if": replace_period_if,
}
