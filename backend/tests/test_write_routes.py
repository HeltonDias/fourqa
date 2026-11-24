"""Port of backend/src/routes/writeRoutes.test.ts patterns."""

import os
import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from fourqa.azure.in_memory_azure_cache import get_in_memory_azure_cache, reset_in_memory_azure_cache


@pytest.fixture()
def client(monkeypatch: pytest.MonkeyPatch):
    db_dir = tempfile.mkdtemp()
    db_path = Path(db_dir) / "fourqa.db"
    monkeypatch.setenv("FOURQA_DB", str(db_path))
    monkeypatch.setenv("DB_PROVIDER", "sqlite")
    monkeypatch.setenv("AZURE_CACHE_READ", "1")
    monkeypatch.setenv("FOURQA_API_TOKEN", "")
    monkeypatch.setenv("FOURQA_SESSION_SECRET", "")
    monkeypatch.setenv("FOURQA_PAT_ENCRYPTION_KEY", "")
    monkeypatch.delenv("FOURQA_ALLOW_OPEN_WRITES", raising=False)
    monkeypatch.delenv("VERCEL", raising=False)
    reset_in_memory_azure_cache()
    from fourqa.app import create_app

    yield TestClient(create_app(skip_operational_assert=True))
    reset_in_memory_azure_cache()


def test_writes_closed_without_token(client: TestClient):
    for method, path, body in [
        ("PUT", "/api/cabecalho", {}),
        ("PUT", "/api/periodo", {}),
        ("POST", "/api/planejamento/revisao", None),
        ("PUT", "/api/planejamento/celula", {}),
        ("PUT", "/api/planejamento/distribuir", {}),
        ("POST", "/api/sync", None),
    ]:
        kwargs = {"json": body} if body is not None else {}
        res = client.request(method, path, **kwargs)
        assert res.status_code == 503
        assert "Escrita desabilitada" in res.json().get("detail", res.json().get("error", ""))


def test_bearer_auth(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("FOURQA_API_TOKEN", "segredo-local")
    assert client.post("/api/sync").status_code == 401
    assert client.post("/api/sync", headers={"Authorization": "Bearer outro"}).status_code == 401
    opened = client.put("/api/cabecalho", headers={"Authorization": "Bearer segredo-local"}, json={"title": "", "subtitle": ""})
    assert opened.status_code == 400
    monkeypatch.setenv("FOURQA_API_TOKEN", "")


def test_open_writes_opt_in(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("FOURQA_ALLOW_OPEN_WRITES", "1")
    res = client.put("/api/cabecalho", json={"title": "", "subtitle": ""})
    assert res.status_code == 400
    monkeypatch.delenv("FOURQA_ALLOW_OPEN_WRITES", raising=False)


def test_cache_read_execucoes(client: TestClient):
    closed = client.get("/api/execucoes?planKey=Vazio")
    assert closed.status_code == 200
    assert closed.json()["total"] == 0
    get_in_memory_azure_cache().commit_successful_refresh(
        {
            "kpiPlanKey": "Vazio",
            "plans": [{"planKey": "Vazio", "execucoes": [], "falhas": [], "dimensions": [], "kpi": None}],
            "suiteRefs": [],
        },
        {
            "fetchedAt": "2026-10-15T00:00:00.000Z",
            "dimensoesMeta": {},
            "workbookMeta": {"kpi_plan_key": "Vazio"},
            "summary": {"execucoes": 0, "falhas": 0, "suites": 0, "runs": 0, "kpi": None},
        },
    )
    empty = client.get("/api/execucoes?planKey=Vazio")
    assert empty.status_code == 200
    assert empty.json()["total"] == 0
    other = client.get("/api/falhas?planKey=Outro")
    assert other.status_code == 200
    assert other.json()["total"] == 0


def test_vercel_read_auth(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("VERCEL", "1")
    monkeypatch.setenv("FOURQA_PROTECT_READS", "1")
    monkeypatch.setenv("FOURQA_API_TOKEN", "segredo-vercel")
    monkeypatch.delenv("FOURQA_ALLOW_OPEN_WRITES", raising=False)
    assert client.get("/api/execucoes?planKey=Vazio").status_code == 401
    assert client.get("/api/health").status_code == 200
    authed = client.get("/api/execucoes?planKey=Vazio", headers={"Authorization": "Bearer segredo-vercel"})
    assert authed.status_code != 401
    monkeypatch.setenv("FOURQA_API_TOKEN", "")
    monkeypatch.setenv("FOURQA_ALLOW_OPEN_WRITES", "1")
    write = client.post("/api/sync")
    assert write.status_code == 503


def test_session_cookie_authorizes_without_exposing_token(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("FOURQA_API_TOKEN", "segredo-local")
    denied = client.post("/api/session", json={"token": "outro"})
    assert denied.status_code == 401
    assert "set-cookie" not in denied.headers
    opened = client.post("/api/session", json={"token": "segredo-local"})
    assert opened.status_code == 200
    assert opened.json() == {"ok": True}
    assert "segredo-local" not in opened.text
    cookie = opened.headers["set-cookie"].lower()
    assert "httponly" in cookie
    assert "fourqa_session=" in cookie
    state = client.get("/api/session")
    assert state.json()["active"] is True
    saved = client.put("/api/cabecalho", json={"title": "", "subtitle": ""})
    assert saved.status_code == 400
    client.delete("/api/session")
    assert client.put("/api/cabecalho", json={"title": "A", "subtitle": "B"}).status_code == 401


def test_vercel_read_accepts_session_cookie(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("VERCEL", "1")
    monkeypatch.setenv("FOURQA_PROTECT_READS", "1")
    monkeypatch.setenv("FOURQA_API_TOKEN", "segredo-vercel")
    client.cookies.set("fourqa_session", "segredo-vercel")
    assert client.get("/api/execucoes?planKey=Vazio").status_code != 401


def test_unexpected_write_hides_internal_detail(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("FOURQA_ALLOW_OPEN_WRITES", "1")

    async def boom(*_args, **_kwargs):
        raise RuntimeError("postgres://user:secret@db/fourqa")

    monkeypatch.setattr("fourqa.services.report_service.set_cabecalho", boom)
    res = client.put("/api/cabecalho", json={"title": "Titulo", "subtitle": "Sub"})
    assert res.status_code == 500
    assert "secret" not in res.text
    assert "postgres://" not in res.text
    assert "Não foi possível gravar o cabeçalho." in res.text


def test_validation_error_stays_400(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("FOURQA_ALLOW_OPEN_WRITES", "1")

    async def bad(*_args, **_kwargs):
        raise ValueError("Título rejeitado pela regra.")

    monkeypatch.setattr("fourqa.services.report_service.set_cabecalho", bad)
    res = client.put("/api/cabecalho", json={"title": "Titulo", "subtitle": "Sub"})
    assert res.status_code == 400
    assert "Título rejeitado pela regra." in res.text


def test_conflict_stays_409(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    from fourqa.persistence.planning_conflict import PlanningConflictError

    monkeypatch.setenv("FOURQA_ALLOW_OPEN_WRITES", "1")

    async def clash(*_args, **_kwargs):
        raise PlanningConflictError(PlanningConflictError.header_changed)

    monkeypatch.setattr("fourqa.services.report_service.set_cabecalho", clash)
    res = client.put("/api/cabecalho", json={"title": "Titulo", "subtitle": "Sub"})
    assert res.status_code == 409
    assert PlanningConflictError.header_changed in res.text
