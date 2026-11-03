import pytest

from fourqa.domain.distribute import (
    count_planning_balance,
    distribution_days,
    saldo_deltas,
    spread_quantity,
)


def test_spread_quantity_keeps_total_and_shape():
    assert spread_quantity(8, 4, "uniforme") == [2, 2, 2, 2]
    assert spread_quantity(10, 4, "crescente") == [1, 2, 3, 4]
    assert spread_quantity(9, 5, "montanha") == [1, 2, 3, 2, 1]
    assert spread_quantity(0, 3, "decrescente") == [0, 0, 0]


def test_distribution_skips_weekend_unless_enabled():
    days = distribution_days("2026-10-26", "2026-11-01", 0, set())
    assert "2026-10-26" in days
    assert "2026-10-31" not in days
    assert "2026-11-01" not in days
    enabled = distribution_days("2026-10-26", "2026-11-01", 0, {"2026-10-31"})
    assert "2026-10-31" in enabled


def test_balance_counts_passed_and_na_as_finalized():
    assert count_planning_balance(["passed", "na", "failed"]) == {
        "scope": 3,
        "finalized": 2,
        "pending": 1,
    }


def test_saldo_rejects_invalid_pending():
    with pytest.raises(ValueError, match="Saldo pendente inválido"):
        saldo_deltas([], ["2026-10-26"], "uniforme", {"pending": -1})
