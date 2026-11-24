import pytest

from fourqa.persistence.plan_key import (
    explicit_plan_key_from_query,
    plan_key_from_raw,
    plan_key_write_error,
    required_plan_key,
)


def test_plan_key_from_raw_fallback():
    assert plan_key_from_raw(None, "PlanTeste") == "PlanTeste"
    assert plan_key_from_raw("", "PlanTeste") == "PlanTeste"
    assert plan_key_from_raw("   ", "PlanTeste") == "PlanTeste"
    assert plan_key_from_raw(" EndToEnd ", "PlanTeste") == "EndToEnd"


def test_explicit_plan_key_for_writes():
    assert explicit_plan_key_from_query(None) is None
    assert explicit_plan_key_from_query("") is None
    assert explicit_plan_key_from_query(["A", "B"]) is None
    assert explicit_plan_key_from_query(" EndToEnd ") == "EndToEnd"
    assert plan_key_write_error(None) == "Informe o planKey."
    assert plan_key_write_error(["A", "B"]) == "planKey ambíguo."


def test_required_plan_key():
    with pytest.raises(ValueError, match="planKey obrigatório"):
        required_plan_key(None)
    with pytest.raises(ValueError, match="planKey obrigatório"):
        plan_key_from_raw("", "  ")
