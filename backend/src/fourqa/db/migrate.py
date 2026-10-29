"""SQLite schema migrations (mirrors backend/src/db/migrate.ts)."""

from __future__ import annotations

import sqlite3
from datetime import datetime, timezone
from typing import Callable

SCHEMA_VERSION = 8


def _index_if(db: sqlite3.Connection, name: str, table: str, columns: list[str]) -> None:
    cols = {row[1] for row in db.execute(f"PRAGMA table_info({table})")}
    if not all(c in cols for c in columns):
        return
    db.execute(f"CREATE INDEX IF NOT EXISTS {name} ON {table}({', '.join(columns)})")


def _migration_v1(db: sqlite3.Connection) -> None:
    db.executescript(
        """
        CREATE TABLE IF NOT EXISTS execucoes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          plan_key TEXT, plan_id INTEGER, plan_name TEXT, frente TEXT, atalho TEXT, processo TEXT,
          suite_id INTEGER, suite_name TEXT, test_point_id INTEGER, test_case_id INTEGER,
          test_case_title TEXT, responsabilidade TEXT, test_case_state TEXT, test_point_state TEXT,
          outcome TEXT, date_completed TEXT, run_by TEXT, last_updated_date TEXT,
          last_test_run_id INTEGER, last_result_id INTEGER, test_case_link TEXT, test_case_tags TEXT
        );
        CREATE TABLE IF NOT EXISTS falhas (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          plan_key TEXT, responsavel TEXT, ambiente TEXT, categoria TEXT, bug_id INTEGER,
          impacto REAL, frente TEXT, titulo TEXT, status TEXT, criacao TEXT, fechamento TEXT,
          links TEXT, tags TEXT
        );
        CREATE TABLE IF NOT EXISTS planejamento_linhas (
          row_num INTEGER PRIMARY KEY, qa TEXT, prioridades TEXT, frente TEXT, processo TEXT,
          data_inicio TEXT, data_fim TEXT, replanejamento REAL, qtd_cts_plan REAL,
          cts_plan_dia REAL, cts_cancelados REAL
        );
        CREATE TABLE IF NOT EXISTS workbook_meta (key TEXT PRIMARY KEY, value TEXT);
        """
    )
    _index_if(db, "idx_exec_plan", "execucoes", ["plan_key"])
    _index_if(db, "idx_exec_suite", "execucoes", ["suite_name"])
    _index_if(db, "idx_falhas_plan", "falhas", ["plan_key"])
    _index_if(db, "idx_falhas_frente", "falhas", ["frente"])


def _add_column(db: sqlite3.Connection, table: str, column: str, col_type: str) -> None:
    cols = {row[1] for row in db.execute(f"PRAGMA table_info({table})")}
    if column not in cols:
        db.execute(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}")


def _migration_v2(db: sqlite3.Connection) -> None:
    for col, typ in (
        ("parent_suite_id", "INTEGER"),
        ("suite_depth", "INTEGER"),
        ("suite_path", "TEXT"),
        ("dimensions_json", "TEXT"),
    ):
        _add_column(db, "execucoes", col, typ)
    _index_if(db, "idx_exec_point", "execucoes", ["plan_key", "test_point_id"])


def _migration_v3(db: sqlite3.Connection) -> None:
    db.executescript(
        """
        CREATE TABLE IF NOT EXISTS planning (
          id INTEGER PRIMARY KEY AUTOINCREMENT, plan_key TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS planning_revision (
          id INTEGER PRIMARY KEY AUTOINCREMENT, planning_id INTEGER NOT NULL, version INTEGER NOT NULL,
          created_at TEXT NOT NULL, reason TEXT NOT NULL, baseline_origin TEXT NOT NULL,
          scope_snapshot INTEGER NOT NULL DEFAULT 0, UNIQUE (planning_id, version)
        );
        CREATE TABLE IF NOT EXISTS planning_item (
          id INTEGER PRIMARY KEY AUTOINCREMENT, revision_id INTEGER NOT NULL, suite_id INTEGER,
          suite_name TEXT, planned_start TEXT, planned_end TEXT, baseline_quantity REAL
        );
        CREATE TABLE IF NOT EXISTS planning_scope_item (
          id INTEGER PRIMARY KEY AUTOINCREMENT, revision_id INTEGER NOT NULL, plan_id INTEGER,
          suite_id INTEGER, test_point_id INTEGER, test_case_id INTEGER, label TEXT
        );
        CREATE TABLE IF NOT EXISTS planning_allocation (
          id INTEGER PRIMARY KEY AUTOINCREMENT, item_id INTEGER NOT NULL, alloc_date TEXT NOT NULL,
          planned_quantity REAL NOT NULL, UNIQUE (item_id, alloc_date)
        );
        """
    )
    _index_if(db, "idx_plan_rev", "planning_revision", ["planning_id", "version"])
    _index_if(db, "idx_plan_item_rev", "planning_item", ["revision_id"])
    _index_if(db, "idx_plan_scope_rev", "planning_scope_item", ["revision_id", "test_point_id"])
    _index_if(db, "idx_plan_alloc_item", "planning_allocation", ["item_id", "alloc_date"])


def _migration_v4(db: sqlite3.Connection) -> None:
    db.execute(
        "UPDATE workbook_meta SET value = ? WHERE key = 'data_inicio' AND value = ?",
        ("2026-08-03", "0939-08-03"),
    )


def _migration_v5(db: sqlite3.Connection) -> None:
    row = db.execute(
        "SELECT value FROM workbook_meta WHERE key = ?", ("planejamento_legado_plan_key",)
    ).fetchone()
    if row and str(row[0]).strip():
        return
    table = db.execute(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'planejamento_linhas'"
    ).fetchone()
    if not table:
        return
    count = db.execute("SELECT COUNT(*) AS n FROM planejamento_linhas").fetchone()
    if not count or count[0] == 0:
        return
    db.execute(
        "INSERT INTO workbook_meta (key, value) VALUES (?, ?)",
        ("planejamento_legado_plan_key", "EndToEnd"),
    )


def _migration_v6(db: sqlite3.Connection) -> None:
    cols = {row[1] for row in db.execute("PRAGMA table_info(planning_item)")}
    if not cols:
        return
    for col in ("test_point_id", "test_case_id"):
        if col not in cols:
            db.execute(f"ALTER TABLE planning_item ADD COLUMN {col} INTEGER")
    db.executescript(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS uq_plan_item_suite
          ON planning_item (revision_id, suite_id) WHERE suite_id IS NOT NULL;
        CREATE UNIQUE INDEX IF NOT EXISTS uq_plan_item_point
          ON planning_item (revision_id, test_point_id) WHERE suite_id IS NULL AND test_point_id IS NOT NULL;
        """
    )


def _migration_v7(db: sqlite3.Connection) -> None:
    cols = {row[1] for row in db.execute("PRAGMA table_info(planning_item)")}
    if not cols:
        return
    for col in ("responsavel", "prioridade"):
        if col not in cols:
            db.execute(f"ALTER TABLE planning_item ADD COLUMN {col} TEXT")


def _migration_v8(db: sqlite3.Connection) -> None:
    db.executescript(
        """
        CREATE TABLE IF NOT EXISTS planning_change_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT, planning_id INTEGER NOT NULL, created_at TEXT NOT NULL,
          actor TEXT, suite_id INTEGER, test_point_id INTEGER, suite_name TEXT, field TEXT NOT NULL,
          alloc_date TEXT, old_value TEXT, new_value TEXT
        );
        """
    )
    _index_if(db, "idx_plan_change_log", "planning_change_log", ["planning_id", "created_at"])


MIGRATIONS: list[tuple[int, Callable[[sqlite3.Connection], None]]] = [
    (1, _migration_v1),
    (2, _migration_v2),
    (3, _migration_v3),
    (4, _migration_v4),
    (5, _migration_v5),
    (6, _migration_v6),
    (7, _migration_v7),
    (8, _migration_v8),
]


def _ensure_hierarchy_columns(db: sqlite3.Connection) -> None:
    cols = {row[1] for row in db.execute("PRAGMA table_info(execucoes)")}
    if not cols:
        return
    for col, typ in (
        ("parent_suite_id", "INTEGER"),
        ("suite_depth", "INTEGER"),
        ("suite_path", "TEXT"),
        ("dimensions_json", "TEXT"),
    ):
        if col not in cols:
            db.execute(f"ALTER TABLE execucoes ADD COLUMN {col} {typ}")
    _index_if(db, "idx_exec_point", "execucoes", ["plan_key", "test_point_id"])


def migrate(db: sqlite3.Connection) -> None:
    db.execute(
        """
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL
        )
        """
    )
    row = db.execute("SELECT MAX(version) AS v FROM schema_migrations").fetchone()
    current = int(row[0]) if row and row[0] is not None else 0
    for version, fn in MIGRATIONS:
        if version <= current:
            continue
        db.execute("BEGIN IMMEDIATE")
        try:
            fn(db)
            db.execute(
                "INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)",
                (version, datetime.now(timezone.utc).isoformat()),
            )
            db.commit()
        except Exception:
            db.rollback()
            raise
    _ensure_hierarchy_columns(db)


def schema_version(db: sqlite3.Connection) -> int:
    try:
        row = db.execute("SELECT MAX(version) AS v FROM schema_migrations").fetchone()
        return int(row[0]) if row and row[0] is not None else 0
    except sqlite3.Error:
        return 0
