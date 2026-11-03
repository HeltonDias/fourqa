"""PEM inline do PostgreSQL vira arquivo gravável fora do bundle."""

import tempfile
from pathlib import Path

import pytest

from fourqa.db.postgres.pool import postgres_ca_file

PEM = "-----BEGIN CERTIFICATE-----\nTESTE\n-----END CERTIFICATE-----\n"


def test_inline_ca_is_written_to_temp_dir(monkeypatch: pytest.MonkeyPatch, tmp_path: Path):
    monkeypatch.setenv("DATABASE_SSL_CA", PEM)
    monkeypatch.setattr(tempfile, "tempdir", str(tmp_path))
    path = Path(postgres_ca_file("postgresql://u@db.example.supabase.co:6543/postgres") or "")
    assert path.parent == tmp_path
    assert path.read_text(encoding="utf-8") == PEM.strip()


def test_inline_ca_must_be_pem(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("DATABASE_SSL_CA", "not a certificate")
    with pytest.raises(RuntimeError):
        postgres_ca_file("postgresql://u@db.example.supabase.co:6543/postgres")
