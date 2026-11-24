"""One-off: rebuild postgres_planning_store from sqlite_planning_store with async query()."""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SQLITE = ROOT / "src/fourqa/db/sqlite_planning_store.py"
OUT = ROOT / "src/fourqa/db/postgres/postgres_planning_store.py"

text = SQLITE.read_text(encoding="utf-8")
text = re.sub(r"sqlite_planning_store = \{.*\}\s*$", "", text, flags=re.S)
text = text.replace(
    '"""SQLite planning store (mirrors backend/src/db/sqlitePlanningStore.ts)."""',
    '"""PostgreSQL planning store (mirrors postgresPlanningStore.ts)."""',
)
text = text.replace(
    "from fourqa.db.db import get_db\n",
    "",
)
header = """
from psycopg import AsyncConnection

from fourqa.db.postgres.migrate import PLANNING_CHANGE_LOG_VERSION
from fourqa.db.postgres.pool import as_flag, as_number, as_number_or_null, as_text, bind, get_pool, query, with_transaction
"""
text = text.replace("from __future__ import annotations\n\n", "from __future__ import annotations\n" + header + "\n", 1)
text = text.replace("?", "$%s")
for name in [
    "latest_revision",
    "revision_by_version",
    "list_revisions",
    "load_scope",
    "load_schedule",
    "commit_revision",
    "save_cell",
    "save_cells",
    "append_change_log",
    "list_change_log",
    "change_log_supported",
    "_apply_cell",
    "_planning_id_for_key",
    "_insert_change_log",
    "_assert_batch",
]:
    text = text.replace(f"def {name}(", f"async def {name}(")

# get_db().execute(...).fetchone()
text = re.sub(
    r"get_db\(\)\.execute\(([^,]+),\s*(\([^)]*\))\)\.fetchone\(\)",
    r"(await query(\1, list\2))[0] if (await query(\1, list\2)) else None",
    text,
)
# get_db().execute(...).fetchall()
text = re.sub(
    r"get_db\(\)\.execute\(([^,]+),\s*(\([^)]*\)|\[\])\)\.fetchall\(\)",
    r"await query(\1, list\2 if isinstance(\2, tuple) else \2)",
    text,
)
text = text.replace("get_db()", "await _broken_get_db()")
text = text.replace("db = get_db()", "pool = get_pool()")
text = text.replace("db.execute", "# FIXME db.execute")
text += """

async def _broken_get_db():
    raise RuntimeError("postgres_planning_store: unconverted get_db() call")


postgres_planning_store = {
    "latest_revision": latest_revision,
    "revision_by_version": revision_by_version,
    "list_revisions": list_revisions,
    "load_scope": load_scope,
    "load_schedule": load_schedule,
    "commit_revision": commit_revision,
    "save_cell": save_cell,
    "save_cells": save_cells,
    "append_change_log": append_change_log,
    "list_change_log": list_change_log,
    "change_log_supported": change_log_supported,
}
"""
OUT.write_text(text, encoding="utf-8")
print("wrote", OUT, "lines", len(text.splitlines()))
