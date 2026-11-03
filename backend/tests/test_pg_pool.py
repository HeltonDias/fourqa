"""Pool PostgreSQL na Vercel: PEM inline fora do bundle e limites do pool."""

import tempfile
from pathlib import Path

import pytest

from fourqa.db.postgres.pool import get_pool, postgres_ca_file

PEM = "-----BEGIN CERTIFICATE-----\nTESTE\n-----END CERTIFICATE-----\n"


def test_inline_ca_is_written_to_temp_dir(monkeypatch: pytest.MonkeyPatch, tmp_path: Path):
    monkeypatch.setenv("DATABASE_SSL_CA", PEM)
    monkeypatch.setattr(tempfile, "tempdir", str(tmp_path))
    path = Path(postgres_ca_file("postgresql://u@db.example.supabase.co:6543/postgres") or "")
    assert path.parent == tmp_path
    assert path.read_text(encoding="utf-8") == PEM.strip()


def test_vercel_pool_holds_a_single_connection(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("VERCEL", "1")
    monkeypatch.setenv("DATABASE_URL", "postgresql://u:p@localhost:5432/fourqa")
    monkeypatch.setenv("DATABASE_SSL_CA", "")
    monkeypatch.setenv("DATABASE_SSL_CA_FILE", "")
    get_pool.cache_clear()
    try:
        pool = get_pool()
        assert (pool.min_size, pool.max_size) == (1, 1)
    finally:
        get_pool.cache_clear()


def test_inline_ca_must_be_pem(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("DATABASE_SSL_CA", "not a certificate")
    with pytest.raises(RuntimeError):
        postgres_ca_file("postgresql://u@db.example.supabase.co:6543/postgres")
