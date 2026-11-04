"""Shape do deploy Vercel e árvore única de migrations."""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def test_vercel_static_api_split():
    vercel = json.loads((ROOT / "vercel.json").read_text(encoding="utf-8"))
    assert vercel["outputDirectory"] == "frontend/dist"
    assert any("(?!api/)" in r["source"] for r in vercel["rewrites"])
    assert any(r["source"] == "/api/:path*" and r["destination"] == "/api/index?rest=:path*" for r in vercel["rewrites"])
    assert not any(r["destination"] == "/api" for r in vercel["rewrites"])
    assert vercel["functions"]["api/index.py"]["maxDuration"] == 300
    entry = (ROOT / "api" / "index.py").read_text(encoding="utf-8")
    assert "fourqa.app" in entry
    snapshot = (
        ROOT / "backend" / "src" / "fourqa" / "db" / "postgres" / "postgres_azure_snapshot_store.py"
    ).read_text(encoding="utf-8")
    assert "DELETE FROM execucoes" in snapshot
    assert "DELETE FROM falhas" in snapshot
    assert "DELETE FROM workbook_meta" not in snapshot
    assert "planning_item" not in snapshot


def test_vercelignore_excludes_local_data():
    ignore = (ROOT / ".vercelignore").read_text(encoding="utf-8")
    lines = {line.strip() for line in ignore.splitlines() if line.strip() and not line.strip().startswith("#")}
    required = {
        "data/",
        "*.db",
        "*.db-wal",
        "*.db-shm",
        "*.sqlite",
        "*.sqlite3",
        "fonte/**/*.xlsx",
        "fonte/scripts.zip",
    }
    for pattern in required:
        assert pattern in lines


def test_single_sql_tree():
    live = ROOT / "backend" / "src" / "db" / "postgres" / "migrations"
    ghost = ROOT / "backend" / "src" / "fourqa" / "db" / "postgres" / "migrations"
    assert sorted(p.name for p in live.glob("*.sql")) == [
        "001_baseline.sql",
        "002_plan_item_identity.sql",
        "003_plan_suite_fill.sql",
        "004_planning_change_log.sql",
        "005_users_connections.sql",
        "006_connection_invite.sql",
    ]
    assert not ghost.exists()
    from fourqa.db.postgres.migrate import _MIGRATIONS_DIR

    assert _MIGRATIONS_DIR.resolve() == live.resolve()


def test_pyright_checks_are_not_silenced():
    text = (ROOT / "backend" / "pyproject.toml").read_text(encoding="utf-8")
    assert 'reportArgumentType = "none"' not in text
    assert 'reportGeneralTypeIssues = "none"' not in text
    assert 'reportUnknownMemberType = "none"' not in text
