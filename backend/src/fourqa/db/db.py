"""SQLite access for tests (mirrors backend/src/db.ts)."""

from __future__ import annotations

import os
import shutil
import sqlite3
from pathlib import Path

from fourqa.db import migrate

SCHEMA_VERSION = migrate.SCHEMA_VERSION

_root = Path(__file__).resolve().parents[4]
_default_db = _root / "data" / "fourqa.db"
_legacy_default_db = _root / "data" / "motor_qa.db"

_db: sqlite3.Connection | None = None


def configured_db_path() -> str:
    return (os.environ.get("FOURQA_DB") or "").strip()


def adopt_renamed_database(target: Path, legacy: Path, explicit_path: bool) -> Path:
    if explicit_path or target.exists() or not legacy.exists():
        return target
    try:
        shutil.move(str(legacy), str(target))
        for suffix in ("-wal", "-shm", "-journal"):
            src = Path(f"{legacy}{suffix}")
            if src.exists():
                shutil.move(str(src), str(Path(f"{target}{suffix}")))
        return target
    except OSError:
        return legacy


def get_db_path() -> Path:
    configured = configured_db_path()
    if configured:
        return Path(configured)
    return adopt_renamed_database(_default_db, _legacy_default_db, False)


def get_db() -> sqlite3.Connection:
    global _db
    if _db is None:
        path = get_db_path()
        path.parent.mkdir(parents=True, exist_ok=True)
        _db = sqlite3.connect(path, check_same_thread=False)
        _db.row_factory = sqlite3.Row
        _db.execute("PRAGMA journal_mode = WAL")
        migrate.migrate(_db)
    return _db


def db_ready() -> bool:
    try:
        return migrate.schema_version(get_db()) >= SCHEMA_VERSION
    except sqlite3.Error:
        return False
