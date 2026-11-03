import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from fourqa.azure.in_memory_azure_cache import get_in_memory_azure_cache, reset_in_memory_azure_cache


def _row(test_point_id: int, suite_id: int, suite_name: str, outcome: str) -> dict[str, object]:
    return {
        "plan_key": "Plano",
        "plan_id": 1,
        "plan_name": "Plano",
        "suite_id": suite_id,
        "suite_name": suite_name,
        "test_point_id": test_point_id,
        "test_case_id": test_point_id + 1000,
        "test_case_title": f"Caso {test_point_id}",
        "test_case_state": "Ready",
        "test_point_state": "Ready",
        "outcome": outcome,
        "dimensions_json": None,
    }


@pytest.fixture()
def client(monkeypatch: pytest.MonkeyPatch):
    db_path = Path(tempfile.mkdtemp()) / "fourqa.db"
    monkeypatch.setenv("FOURQA_DB", str(db_path))
    monkeypatch.setenv("DB_PROVIDER", "sqlite")
    monkeypatch.setenv("AZURE_CACHE_READ", "1")
    monkeypatch.setenv("FOURQA_API_TOKEN", "")
    monkeypatch.setenv("FOURQA_ALLOW_OPEN_WRITES", "1")
    monkeypatch.delenv("VERCEL", raising=False)
    reset_in_memory_azure_cache()
    get_in_memory_azure_cache().commit_successful_refresh(
        {
            "kpiPlanKey": "Plano",
            "plans": [
                {
                    "planKey": "Plano",
                    "execucoes": [
                        _row(1, 10, "Login", "Passed"),
                        _row(2, 10, "Login", "Failed"),
                        _row(3, 20, "Pagamento", "Active"),
                    ],
                    "falhas": [],
                    "dimensions": [],
                    "kpi": None,
                }
            ],
            "suiteRefs": [],
        },
        {
            "fetchedAt": "2026-10-15T00:00:00.000Z",
            "dimensoesMeta": {},
            "workbookMeta": {"kpi_plan_key": "Plano"},
            "summary": {"execucoes": 3, "falhas": 0, "suites": 2, "runs": 0, "kpi": None},
        },
    )
    from fourqa.app import create_app

    app_client = TestClient(create_app(skip_operational_assert=True))
    assert app_client.put("/api/periodo", json={"inicio": "2026-10-01", "fim": "2026-10-30"}).status_code == 200
    yield app_client
    reset_in_memory_azure_cache()


def test_legacy_baseline_message_has_no_decimal():
    from fourqa.domain.planning import schedule_integrity_message

    assert schedule_integrity_message(12.0, 0) == "12 cenários ainda não distribuídos no cronograma"
    assert schedule_integrity_message(1.0, 2) == "1 cenário distribuído além do baseline"


def test_period_persists_real_dates(client: TestClient):
    res = client.put("/api/periodo", json={"inicio": "2026-11-02", "fim": "2026-11-20"})
    assert res.status_code == 200, res.text
    assert "2026-11-02" in res.text and "2026-11-20" in res.text


def test_confirm_baseline_creates_revision_per_suite(client: TestClient):
    res = client.post("/api/planejamento/revisao?planKey=Plano", json={"reason": "primeira"})
    assert res.status_code == 200, res.text
    view = client.get("/api/planejamento?planKey=Plano")
    assert view.status_code == 200, view.text
    body = view.json()
    assert len(body["revisions"]) == 1
    assert body["revisions"][0]["version"] == 1


def test_distribution_preview_runs(client: TestClient):
    assert client.post("/api/planejamento/revisao?planKey=Plano", json={}).status_code == 200
    res = client.put(
        "/api/planejamento/distribuir?planKey=Plano",
        json={
            "strategy": "uniforme",
            "start": "2026-10-05",
            "end": "2026-10-09",
            "resguardo": 0,
            "enabledWeekendDays": [],
            "preview": True,
        },
    )
    assert res.status_code == 200, res.text
