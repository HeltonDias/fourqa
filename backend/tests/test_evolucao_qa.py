"""Evolução QA MVP (DEC-037)."""

from fourqa.domain.evolucao_qa import UNATTRIBUTED_KEY, build_evolucao_qa, owner_of


def test_owner_of():
    assert owner_of("Ana") == ("Ana", None)
    assert owner_of("  ") == (None, "sem_responsavel")
    assert owner_of(None) == (None, "sem_responsavel")
    assert owner_of("Ana, Bia") == (None, "compartilhada")
    assert owner_of("Ana e Bia") == (None, "compartilhada")
    assert owner_of("Ana/Bia") == (None, "compartilhada")
    assert owner_of("Eduardo") == ("Eduardo", None)


def _item(suite_id, responsavel, allocations, baseline=4, passed=0, na=0, failed=0, blocked=0):
    return {
        "suiteId": suite_id,
        "testPointId": None,
        "suiteName": f"S{suite_id}",
        "responsavel": responsavel,
        "baselineCount": baseline,
        "allocations": allocations,
        "passed": passed,
        "na": na,
        "failed": failed,
        "blocked": blocked,
    }


def _exec(suite_id, outcome, day):
    return {"suite_id": suite_id, "test_point_id": None, "outcome": outcome, "date_completed": f"{day}T10:00:00Z"}


def test_build_evolucao_attributes_only_single_owner():
    items = [
        _item(1, "Ana", {"2026-03-02": 2, "2026-03-03": 2}, passed=2, failed=1),
        _item(2, "ana", {"2026-03-03": 1}, baseline=1),
        _item(3, "Ana, Bia", {"2026-03-02": 3}, baseline=3, passed=1),
        _item(4, "", {"2026-03-04": 2}, baseline=2),
    ]
    rows = [
        _exec(1, "Passed", "2026-03-02"),
        _exec(1, "Passed", "2026-03-03"),
        _exec(1, "Failed", "2026-03-03"),
        _exec(3, "Passed", "2026-03-02"),
        _exec(1, "Passed", "2026-02-20"),
    ]
    out = build_evolucao_qa(items, rows, "2026-03-01", "2026-03-05", as_of="2026-03-03")
    assert [q["name"] for q in out["qas"]] == ["Ana"]
    ana = out["qas"][0]
    assert ana["suiteCount"] == 2
    assert ana["baseline"] == 5
    assert ana["planned"] == 5
    assert ana["plannedToDate"] == 5
    assert ana["finalizedInRange"] == 2
    assert ana["finalized"] == 2
    assert ana["executed"] == 3
    assert ana["gap"] == 3
    assert ana["status"] == "warn"
    day3 = next(d for d in ana["daily"] if d["date"] == "2026-03-03")
    assert day3 == {
        "date": "2026-03-03",
        "planned": 3,
        "finalized": 1,
        "executed": 2,
        "plannedCumulative": 5,
        "finalizedCumulative": 2,
    }
    assert next(d for d in ana["daily"] if d["date"] == "2026-03-04")["finalizedCumulative"] is None

    shared = out["unattributed"]
    assert shared["key"] == UNATTRIBUTED_KEY
    assert shared["status"] is None
    assert shared["reasons"] == {"sem_responsavel": 1, "compartilhada": 1}
    assert shared["finalizedInRange"] == 1
    assert shared["planned"] == 5


def test_build_evolucao_empty():
    out = build_evolucao_qa([], [], "2026-03-01", "2026-03-02", as_of="2026-03-01")
    assert out["qas"] == []
    assert out["unattributed"] is None
