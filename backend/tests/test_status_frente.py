from fourqa.services.report_service import _indicadores_dto, _somar_blocos

FRONT_KEYS = {
    "planAteHoje",
    "na",
    "passeds",
    "gap",
    "pctPlan",
    "pctReal",
    "pctBugsDev",
    "pctBugsCliente",
    "bugsAbertos",
    "status",
}


def test_empty_total_does_not_crash():
    total = _somar_blocos([])
    assert set(total["indicadores"]) == FRONT_KEYS


def test_indicadores_use_frontend_contract():
    cenarios = {
        "ttl": 10,
        "plan": 10,
        "planAteHoje": 6,
        "na": 1,
        "passeds": 3,
        "finalizado": 4,
        "falha": 1,
        "bloqueado": 1,
        "liberado": 0,
        "design": 0,
        "naoLib": 0,
    }
    bugs = {"total": 5, "fechados": 2, "impactosDev": 1, "impactosCliente": 2}
    ind = _indicadores_dto(cenarios, bugs)
    assert set(ind) == FRONT_KEYS
    assert ind["gap"] == 2
    assert ind["pctPlan"] == 0.6
    assert ind["pctReal"] == 0.4
    assert ind["pctBugsDev"] == 0.2
    assert ind["pctBugsCliente"] == 0.4
    assert ind["bugsAbertos"] == 3
