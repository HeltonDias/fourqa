import pytest

from fourqa.persistence.operational_provider import assert_operational_provider


def test_postgres_is_always_allowed(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("FOURQA_LOCAL_SQLITE", "")
    assert_operational_provider("postgres")


def test_sqlite_requires_local_opt_in(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("FOURQA_LOCAL_SQLITE", "")
    monkeypatch.delenv("VERCEL", raising=False)
    with pytest.raises(RuntimeError):
        assert_operational_provider("sqlite")
    monkeypatch.setenv("FOURQA_LOCAL_SQLITE", "1")
    assert_operational_provider("sqlite")


def test_sqlite_opt_in_is_refused_on_vercel(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("FOURQA_LOCAL_SQLITE", "1")
    monkeypatch.setenv("VERCEL", "1")
    with pytest.raises(RuntimeError):
        assert_operational_provider("sqlite")
