"""Smoke tests for API router (SQLite). Full route parity pending service ports."""

import os
import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

pytest.importorskip("fourqa.app", reason="fourqa.app pending service layer port")


@pytest.fixture()
def client(monkeypatch: pytest.MonkeyPatch):
    db_dir = tempfile.mkdtemp()
    db_path = Path(db_dir) / "fourqa.db"
    monkeypatch.setenv("FOURQA_DB", str(db_path))
    monkeypatch.setenv("DB_PROVIDER", "sqlite")
    monkeypatch.delenv("VERCEL", raising=False)
    from fourqa.app import create_app

    return TestClient(create_app(skip_operational_assert=True))


def test_health(client: TestClient):
    response = client.get("/api/health")
    assert response.status_code == 200
    body = response.json()
    assert "ok" in body
