"""Port of backend/src/vercel/deployShape.test.ts."""

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
